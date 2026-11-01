// One commit inside the write Worker (SPEC 7.2 steps 11 to 15, 7.4 to 7.6, 8). The Worker runs
// the participants of one operation in one savepoint of one BEGIN IMMEDIATE transaction. A
// stopped operation is rolled back and its rollback receipt goes into a second short
// transaction (SPEC 7.7.5, prefix 0). The group scheduler of G2-P wraps this unit later.
import type { DatabaseSync } from 'node:sqlite'
import {
  combinationManifest,
  manifestDigest,
  type CommitRequestV2,
  type FailureCategory,
  type JsonValue,
  type ParticipantDescriptor,
  type ParticipatedEntry,
  type ParticipatedReply,
  type ReceiptV2,
  type RecordedReply,
  type SqlIdentity,
  type StoppingEntry,
} from '@omne-harness/sql-contract'
import type { ParticipantModule, ParticipantPort } from '@omne-harness/sql-contract/worker'
import { clipDiagnostic } from '../fields.ts'
import { canonicalJson, isStrictJson, utf8Length } from '../json.ts'
import { describeError } from './errors.ts'
import { rollbackQuietly, transact, type WorkerState } from './domain.ts'
import { MaterialMismatch } from './modules.ts'
import { SqlGateway, participantDecision } from './ports.ts'
import type { CommitReply, CommitWorkerRejection, QueryReply, WorkerEnv } from './protocol.ts'

type FactKey = Readonly<{ key: string; protocol: string }>
const factId = (fact: FactKey): string => JSON.stringify([fact.key, fact.protocol])
const sortNames = (names: readonly string[]): string[] => [...names].sort()

// --- Receipts -----------------------------------------------------------------------------------

export function readReceipt(db: DatabaseSync, identity: SqlIdentity): ReceiptV2 | null {
  const row = db
    .prepare('select receipt from _sql_receipt where operation = ? and operation_key = ?')
    .get(identity.operation, identity.operationKey) as { receipt: string } | undefined
  return row === undefined ? null : (JSON.parse(row.receipt) as ReceiptV2)
}

function insertReceipt(db: DatabaseSync, receipt: ReceiptV2): void {
  db.prepare(
    'insert into _sql_receipt(operation, operation_key, kind, input_digest, receipt) values (?, ?, ?, ?, ?)',
  ).run(
    receipt.identity.operation,
    receipt.identity.operationKey,
    receipt.kind,
    receipt.inputDigest,
    JSON.stringify(receipt),
  )
}

function receiptOf(
  kind: 'committed' | 'rolled_back',
  request: CommitRequestV2,
  inputDigest: string,
  entries: readonly (ParticipatedEntry | StoppingEntry)[],
): ReceiptV2 {
  // The entries end with the stopping entry for rolled_back and only participated ones otherwise.
  return {
    kind,
    identity: request.identity,
    inputDigest,
    combinationVersion: request.combinationVersion,
    manifestDigest: request.manifestDigest,
    responses: entries,
  } as unknown as ReceiptV2
}

export function runQuery(state: WorkerState, identity: SqlIdentity): QueryReply {
  const receipt = readReceipt(state.db as DatabaseSync, identity)
  return receipt === null ? { kind: 'none' } : { kind: 'receipt', receipt }
}

// --- Registration and dependency checks (SPEC 7.2 steps 11 to 15) -------------------------------

function dependencyMissing(
  named: readonly string[],
  members: readonly string[],
  descriptors: ReadonlyMap<string, ParticipantDescriptor>,
): boolean {
  const providers = new Map<string, string>()
  for (const name of members)
    for (const fact of descriptors.get(name)?.providesFacts ?? []) providers.set(factId(fact), name)
  return named.some(name =>
    (descriptors.get(name)?.requiresFacts ?? []).some(fact => {
      const provider = providers.get(factId(fact))
      return provider !== undefined && !named.includes(provider)
    }),
  )
}

/** Topological order over the facts, ties broken by name in UTF-16 code units (SPEC 7.5). */
function executionOrder(
  named: readonly string[],
  descriptors: ReadonlyMap<string, ParticipantDescriptor>,
): string[] {
  const providers = new Map<string, string>()
  for (const name of named)
    for (const fact of descriptors.get(name)?.providesFacts ?? []) providers.set(factId(fact), name)
  const order: string[] = []
  const remaining = new Set(named)
  while (remaining.size > 0) {
    const next = sortNames([...remaining]).find(name =>
      (descriptors.get(name)?.requiresFacts ?? []).every(fact => {
        const provider = providers.get(factId(fact))
        return provider === undefined || provider === name || !remaining.has(provider)
      }),
    )
    if (next === undefined) throw new Error('fact dependency cycle in a registered combination')
    order.push(next)
    remaining.delete(next)
  }
  return order
}

function checkRegistration(
  db: DatabaseSync,
  env: WorkerEnv,
  request: CommitRequestV2,
  descriptors: ReadonlyMap<string, ParticipantDescriptor>,
): CommitWorkerRejection | null {
  const row = db
    .prepare(
      'select manifest_digest, participants from _sql_registration where combination_version = ?',
    )
    .get(request.combinationVersion) as { manifest_digest: string; participants: string } | undefined
  if (row === undefined) return 'combination_unregistered'
  if (row.manifest_digest !== request.manifestDigest) return 'manifest_mismatch'
  const members = JSON.parse(row.participants) as string[]
  const judged = combinationManifest({ catalog: env.catalog, participants: members })
  if (judged.kind !== 'manifest' || manifestDigest(judged.manifest) !== row.manifest_digest)
    return 'material_unavailable'
  const named = request.commands.map(command => command.participant)
  if (!named.every(name => members.includes(name))) return 'participant_not_in_combination'
  if (dependencyMissing(named, members, descriptors)) return 'participant_dependency_missing'
  return null
}

// --- Participants -------------------------------------------------------------------------------

type Run =
  | Readonly<{ kind: 'participated'; reply: ParticipatedReply; provided: ReadonlyMap<string, JsonValue> }>
  | Readonly<{ kind: 'stopped'; reply: RecordedReply }>
  | Readonly<{ kind: 'environment'; error: unknown }>

type Violation = 'port_violation' | 'fact_violation'

function judgeReply(reply: unknown): Readonly<{ kind: 'ok' | 'stop'; reply: RecordedReply }> | null {
  if (typeof reply !== 'object' || reply === null) return null
  const record = reply as Record<string, unknown>
  switch (record['kind']) {
    case 'participated':
      return 'response' in record && isStrictJson(record['response'])
        ? { kind: 'ok', reply: { kind: 'participated', response: record['response'] } }
        : null
    case 'conflict':
    case 'unsupported':
      return 'basis' in record && isStrictJson(record['basis'])
        ? { kind: 'stop', reply: { kind: record['kind'], basis: record['basis'] } }
        : null
    case 'failed':
      return typeof record['diagnostic'] === 'string'
        ? {
            kind: 'stop',
            reply: {
              kind: 'failed',
              category: 'participant_reported',
              diagnostic: record['diagnostic'],
            },
          }
        : null
    default:
      return null
  }
}

function runOne(
  db: DatabaseSync,
  env: WorkerEnv,
  descriptor: ParticipantDescriptor,
  module: ParticipantModule,
  facts: Readonly<Record<string, JsonValue>>,
  cell: ReadonlyMap<string, JsonValue>,
): Run {
  const failed = (category: FailureCategory, text: string = category): Run => ({
    kind: 'stopped',
    reply: {
      kind: 'failed',
      category,
      diagnostic: clipDiagnostic(text, env.maxDiagnosticBytes),
    },
  })
  const gateway = new SqlGateway(
    db,
    participantDecision(descriptor.ownedTables, descriptor.readTables, descriptor.allowedFunctions),
  )
  const provided = new Map<string, JsonValue>()
  let violation: Violation | null = null
  let open = true
  const violate = (category: Violation, text: string): never => {
    violation ??= category
    open = false
    gateway.close()
    throw new Error(text)
  }
  const guard = (): void => {
    if (!open) violate(violation ?? 'port_violation', 'port is closed')
  }
  const port: ParticipantPort = {
    execute(sql, params) {
      guard()
      try {
        return gateway.execute(sql, params)
      } catch (error) {
        if (gateway.violated) violation ??= 'port_violation'
        throw error
      }
    },
    requireFact(key) {
      guard()
      if (!descriptor.requiresFacts.some(fact => factId(fact) === factId(key)))
        violate('fact_violation', 'fact not declared as required')
      const value = cell.get(factId(key))
      if (value === undefined) violate('fact_violation', 'fact was not provided')
      return structuredClone(value as JsonValue)
    },
    provideFact(key, value) {
      guard()
      if (!descriptor.providesFacts.some(fact => factId(fact) === factId(key)))
        violate('fact_violation', 'fact not declared as provided')
      if (provided.has(factId(key))) violate('fact_violation', 'fact provided twice')
      if (!isStrictJson(value)) violate('fact_violation', 'fact is not JSON')
      provided.set(factId(key), structuredClone(value))
    },
  }
  let reply: unknown
  let threw = false
  try {
    reply = module.execute(structuredClone(facts), port)
  } catch {
    threw = true
  }
  open = false
  gateway.close()
  if (violation !== null) return failed(violation)
  if (gateway.violated) return failed('port_violation')
  if (gateway.environmentFailure !== null)
    return { kind: 'environment', error: gateway.environmentFailure }
  if (threw) return failed(gateway.dataFailure ? 'sql_error' : 'participant_threw')
  const judged = judgeReply(reply)
  if (judged === null) return failed('invalid_reply')
  if (judged.reply.kind === 'participated') {
    if (gateway.dataFailure) return failed('sql_error')
    return { kind: 'participated', reply: judged.reply, provided }
  }
  if (judged.reply.kind === 'failed')
    return failed('participant_reported', judged.reply.diagnostic)
  return { kind: 'stopped', reply: judged.reply }
}

type Outcome =
  | Readonly<{ kind: 'participated' | 'stopped'; entries: (ParticipatedEntry | StoppingEntry)[] }>
  | Readonly<{ kind: 'environment'; error: unknown }>

function runParticipants(
  db: DatabaseSync,
  env: WorkerEnv,
  order: readonly string[],
  descriptors: ReadonlyMap<string, ParticipantDescriptor>,
  modules: ReadonlyMap<string, ParticipantModule>,
  request: CommitRequestV2,
): Outcome {
  const entries: (ParticipatedEntry | StoppingEntry)[] = []
  const cell = new Map<string, JsonValue>()
  const factsOf = new Map(request.commands.map(command => [command.participant, command.facts]))
  let responseBytes = 0
  for (const name of order) {
    const descriptor = descriptors.get(name) as ParticipantDescriptor
    const run = runOne(
      db,
      env,
      descriptor,
      modules.get(name) as ParticipantModule,
      factsOf.get(name) ?? {},
      cell,
    )
    if (run.kind === 'environment') return run
    let reply: RecordedReply = run.reply
    if (reply.kind !== 'failed') {
      const size = utf8Length(canonicalJson(reply.kind === 'participated' ? reply.response : reply.basis))
      responseBytes += size
      if (size > env.maxResponseBytes || responseBytes > env.maxOperationResponseBytes)
        reply = {
          kind: 'failed',
          category: 'response_limit',
          diagnostic: clipDiagnostic('response_limit', env.maxDiagnosticBytes),
        }
    }
    if (reply.kind === 'participated' && run.kind === 'participated') {
      for (const [id, value] of run.provided) cell.set(id, value)
      entries.push({ participant: name, protocol: descriptor.protocol, reply })
      continue
    }
    entries.push({ participant: name, protocol: descriptor.protocol, reply } as StoppingEntry)
    return { kind: 'stopped', entries }
  }
  return { kind: 'participated', entries }
}

// --- The operation ------------------------------------------------------------------------------

/** ROLLBACK TO and RELEASE of the savepoint, then the end of the empty outer transaction. */
function abandon(db: DatabaseSync): void {
  try {
    db.exec('ROLLBACK TO op_1')
    db.exec('RELEASE op_1')
    db.exec('ROLLBACK')
  } catch {
    // A statement may have ended the whole outer transaction (OR ROLLBACK). Then there is nothing
    // left to undo. If a transaction is still open, the caller sees it in isTransaction.
    rollbackQuietly(db)
  }
}

export async function runCommit(
  env: WorkerEnv,
  state: WorkerState,
  request: CommitRequestV2,
  inputDigest: string,
): Promise<CommitReply> {
  const db = state.db as DatabaseSync
  const descriptors = new Map(env.catalog.participants.map(item => [item.participant, item]))
  const rejected = checkRegistration(db, env, request, descriptors)
  if (rejected !== null) return { kind: 'rejected', reason: rejected }

  const existing = readReceipt(db, request.identity)
  if (existing !== null)
    return existing.inputDigest === inputDigest
      ? { kind: 'receipt', receipt: existing }
      : { kind: 'conflict', existing }

  const order = executionOrder(
    request.commands.map(command => command.participant),
    descriptors,
  )
  const modules = new Map<string, ParticipantModule>()
  try {
    for (const name of order) {
      const descriptor = descriptors.get(name) as ParticipantDescriptor
      modules.set(
        name,
        await state.modules.load<ParticipantModule>(descriptor.moduleUrl, descriptor.codeDigest),
      )
    }
  } catch (error) {
    return {
      kind: 'quarantine',
      diagnostic: error instanceof MaterialMismatch ? 'material_digest_mismatch' : 'module_load_failed',
    }
  }

  try {
    db.exec('BEGIN IMMEDIATE')
  } catch (error) {
    return { kind: 'unknown', diagnostic: describeError('begin', error) }
  }
  let outcome: Outcome
  try {
    db.exec('SAVEPOINT op_1')
    outcome = runParticipants(db, env, order, descriptors, modules, request)
  } catch (error) {
    rollbackQuietly(db)
    return { kind: 'unknown', diagnostic: describeError('execute', error), fatal: db.isTransaction }
  }

  if (outcome.kind === 'participated') {
    const receipt = receiptOf('committed', request, inputDigest, outcome.entries)
    try {
      insertReceipt(db, receipt)
      db.exec('RELEASE op_1')
      db.exec('COMMIT')
    } catch (error) {
      rollbackQuietly(db)
      return { kind: 'unknown', diagnostic: describeError('commit', error), fatal: db.isTransaction }
    }
    return { kind: 'receipt', receipt }
  }

  abandon(db)
  if (db.isTransaction)
    return { kind: 'unknown', diagnostic: 'rollback_state_unclear', fatal: true }
  if (outcome.kind === 'environment')
    return { kind: 'unknown', diagnostic: describeError('environment', outcome.error) }
  const receipt = receiptOf('rolled_back', request, inputDigest, outcome.entries)
  try {
    transact(db, () => insertReceipt(db, receipt))
  } catch (error) {
    return { kind: 'unknown', diagnostic: describeError('rollback_receipt', error) }
  }
  return { kind: 'receipt', receipt }
}
