// The shared fixture of the ModelCommands cases: a node:sqlite test provider of `SqlStorage` that
// runs the real participant, migration and read handlers of this member, and the core options
// (authority, evidence, owners, clock, limits) that build the SQL and the in-memory commands
// alike. The provider keeps one in-memory database per transaction domain, receipts by full
// identity and rollback on a stopping reply. It does not model Workers, durability, queues or
// limits: a pass proves none of those.
import { DatabaseSync } from 'node:sqlite'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type Adoption,
  type DurableEvidence,
  type FixedModelRequest,
  type ModelCallId,
  type ModelInstanceId,
  type ModelOperationId,
} from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  type ModelConsumerOwnerDeclaration,
} from '@omne-harness/model-contract/provider'
import type {
  ModelCommandsAuthority,
  ModelCommandsCoreOptions,
  ModelCommandsEvidence,
} from '@omne-harness/model/commands'
import {
  COMMAND_RESERVE_BYTES,
  callHandler,
  createSqlModelCommands,
  modelMigration,
  pendingHandler,
  type SqlModelCommandsOptions,
} from '@omne-harness/model-storage-sql'
import type { Outcome } from '@omne-harness/operation-result'
import {
  inputDigestV2,
  type CommitRequestV2,
  type CommitResultV2,
  type ReceiptV2,
  type SqlIdentity,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import participant from '../src/commit.ts'

// --- Values --------------------------------------------------------------------------------

export function unbox<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`fixture failure: ${JSON.stringify(outcome.failure)}`)
}

export function tenantOf(letter: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${letter.repeat(26)}`,
      account: `acc_${letter.repeat(26)}`,
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant does not parse')
  return parsed.value
}

export function textOf(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant does not encode')
  return text.value
}

export const callId = (name: string): ModelCallId => unbox(decodeModelCallId(`mcall_${name}`))
export const opId = (name: string): ModelOperationId => unbox(decodeModelOperationId(`mop_${name}`))
export const instanceId = (name = 'one'): ModelInstanceId =>
  unbox(decodeModelInstanceId(`minst_${name}`))

export const ADOPTION: Adoption = {
  owner: 'test-owner',
  name: 'test',
  revision: '1',
  digest: '0'.repeat(64),
}
export const OWNER: ModelConsumerOwnerDeclaration = {
  consumerOwner: 'consumer',
  work: { kind: 'exempt' },
  evidence: ADOPTION,
}
export const DIGEST = 'a'.repeat(64)

/** The request of every admission: two user messages, so kept message identities are visible. */
export const REQUEST: FixedModelRequest = (() => {
  const user = (id: string) => ({
    id: `msg_${id.padEnd(22, '0')}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: `b-${id}`, visibility: { toHuman: true, toModel: true }, text: 'hello' },
    ],
  })
  const judged = judgeFixedModelRequest({
    profile: ADOPTION,
    suppliers: [
      {
        adoption: ADOPTION,
        recipient: 'test.invalid',
        model: 'test',
        credential: { kind: 'factory' },
      },
    ],
    fallback: false,
    retryPolicy: ADOPTION,
    parameters: [],
    system: [],
    messages: [user('u1'), user('u2')],
    tools: [],
    toolChoice: 'none',
    declarations: [
      { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
    ],
    representation: ADOPTION,
    parameterAdoptions: [],
    source: ADOPTION,
  })
  if (!('ok' in judged)) throw new Error(`fixture request: ${JSON.stringify(judged.failure)}`)
  return judged.ok
})()

export function proof(record: string, owner = 'host'): DurableEvidence {
  return { owner, record, revision: '1', digest: '1'.repeat(64) }
}

// --- Test provider -------------------------------------------------------------------------

function rowsOf(db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  const bound = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
  if (/^\s*(SELECT|WITH)/i.test(sql)) {
    const rows = statement.all(...bound)
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    return {
      columns,
      rows: rows.map(row => columns.map(name => (row[name] ?? null) as never)),
      changes: 0n,
      lastInsertRowid: null,
    }
  }
  const result = statement.run(...bound)
  return { columns: [], rows: [], changes: BigInt(result.changes), lastInsertRowid: null }
}

type Domain = { readonly db: DatabaseSync; readonly receipts: Map<string, ReceiptV2> }
const HANDLERS = new Map([callHandler, pendingHandler].map(item => [item.handler, item]))
/** Receipts are kept by the full identity: the scope is part of it, as in the real provider. */
const keyOf = (identity: SqlIdentity) =>
  JSON.stringify([identity.scope, identity.operation, identity.operationKey])

function executeCommit(domain: Domain, request: CommitRequestV2): ReceiptV2 {
  const command = request.commands[0]
  if (command === undefined) throw new Error('no command')
  const head = {
    identity: request.identity,
    inputDigest: inputDigestV2(request),
    combinationVersion: request.combinationVersion,
    manifestDigest: request.manifestDigest,
  }
  domain.db.exec('BEGIN IMMEDIATE')
  const port = {
    execute: (sql: string, params: readonly SqlValue[]) => rowsOf(domain.db, sql, params),
    requireFact: () => null,
    provideFact: () => undefined,
  }
  let reply
  try {
    reply = participant.execute(structuredClone(command.facts), port)
  } catch (error) {
    reply = { kind: 'failed' as const, diagnostic: String(error) }
  }
  const entry = { participant: command.participant, protocol: participant.protocol }
  if (reply.kind === 'participated') {
    domain.db.exec('COMMIT')
    return { kind: 'committed', ...head, responses: [{ ...entry, reply }] }
  }
  domain.db.exec('ROLLBACK')
  const stopping =
    reply.kind === 'failed'
      ? {
          kind: 'failed' as const,
          category: 'participant_reported' as const,
          diagnostic: reply.diagnostic,
        }
      : reply
  return { kind: 'rolled_back', ...head, responses: [{ ...entry, reply: stopping }] }
}

const NOT_COMMITTED_PROOFS = {
  writerGenerationExcluded: true,
  oldTransactionTerminated: true,
  databaseRecoveryFinished: true,
  authoritativeReadSucceeded: true,
  operationNotQueued: true,
} as const

export type SqliteStorage = ReturnType<typeof sqliteStorage>

export function sqliteStorage() {
  const domains = new Map<string, Domain>()
  const hooks: {
    /** The next commit is saved, then its reply is lost (`unknown`). */
    loseNextReply: boolean
    /** Runs once before the next commit reaches the database, as a concurrent writer would. */
    beforeCommit: (() => void) | null
    /** The next commit is rejected before the storage accepts it, for this reason. */
    rejectNext: 'writer_not_current' | 'queue_full' | null
    /** The next commit stays undecided: it answers `unknown` and so does every query of it. */
    holdNext: boolean
  } = { loseNextReply: false, beforeCommit: null, rejectNext: null, holdNext: false }
  const held = new Set<string>()
  let commits = 0
  const domainOf = (name: string): Domain => {
    const found = domains.get(name)
    if (found !== undefined) return found
    const db = new DatabaseSync(':memory:')
    modelMigration.up({ execute: (sql, params) => rowsOf(db, sql, params) })
    const domain = { db, receipts: new Map<string, ReceiptV2>() }
    domains.set(name, domain)
    return domain
  }
  const storage: SqlStorage = {
    registerCombination: input => Promise.resolve({ kind: 'registered', registration: input }),
    commit(request): Promise<CommitResultV2> {
      commits += 1
      const rejected = hooks.rejectNext
      hooks.rejectNext = null
      if (rejected !== null)
        return Promise.resolve({
          kind: 'rejected_before_accept',
          identity: request.identity,
          reason: rejected,
          diagnostic: null,
        })
      const before = hooks.beforeCommit
      hooks.beforeCommit = null
      before?.()
      const domain = domainOf(request.identity.transactionDomain)
      const key = keyOf(request.identity)
      if (hooks.holdNext) {
        hooks.holdNext = false
        held.add(key)
        return Promise.resolve({ kind: 'unknown', identity: request.identity, diagnostic: null })
      }
      const existing = domain.receipts.get(key)
      if (existing !== undefined)
        return Promise.resolve(
          existing.inputDigest === inputDigestV2(request)
            ? existing
            : { kind: 'identity_conflict', identity: request.identity, existing },
        )
      const receipt = executeCommit(domain, request)
      domain.receipts.set(key, receipt)
      if (hooks.loseNextReply) {
        hooks.loseNextReply = false
        return Promise.resolve({ kind: 'unknown', identity: request.identity, diagnostic: null })
      }
      return Promise.resolve(receipt)
    },
    query(identity) {
      if (held.has(keyOf(identity)))
        return Promise.resolve({ kind: 'unknown', identity, diagnostic: null })
      const found = domainOf(identity.transactionDomain).receipts.get(keyOf(identity))
      return Promise.resolve(
        found ?? { kind: 'not_committed', identity, proofs: NOT_COMMITTED_PROOFS },
      )
    },
    read(request) {
      const handler = HANDLERS.get(request.handler)
      const db = domainOf(request.domain.transactionDomain).db
      const outcome = handler?.read(request.input, {
        execute: (sql, params) => rowsOf(db, sql, params),
      })
      return Promise.resolve(
        outcome?.kind === 'read'
          ? { kind: 'read', requestKey: request.requestKey, output: outcome.output }
          : {
              kind: 'unavailable',
              requestKey: request.requestKey,
              reason: 'read_failed',
              diagnostic: outcome?.kind === 'failed' ? outcome.diagnostic : 'no handler',
            },
      )
    },
  }
  return {
    storage,
    hooks,
    commits: () => commits,
    rows: (domain: string, sql: string, params: readonly SqlValue[] = []) =>
      rowsOf(domainOf(domain).db, sql, params).rows,
    seed: (domain: string, sql: string, params: readonly SqlValue[]) =>
      rowsOf(domainOf(domain).db, sql, params),
  }
}

/** Every tenant in `registered` gets its own scope in the transaction domain `domain`. */
export function lookup(registered: readonly string[], domain: string): TenantDomainLookup {
  return {
    lookup: ({ tenant }) =>
      Promise.resolve(
        registered.includes(tenant)
          ? {
              kind: 'ready',
              domain: { scope: { kind: 'tenant', tenant }, transactionDomain: domain },
            }
          : { kind: 'unregistered' },
      ),
  }
}

// --- Core options --------------------------------------------------------------------------

/** A principal of one tenant. The authority knows the principals it minted, by object. */
export type Principal = Readonly<{ subject: string }>

/**
 * The options of the shared core for the tenants given: one minted principal per tenant, the
 * owner declaration, evidence that accepts the proofs of `proof`, and a fixed clock.
 */
export function coreOptions(tenants: readonly TenantId[]) {
  const principals = new Map<Principal, TenantId>()
  const principalOf = new Map<string, Principal>()
  tenants.forEach((scope, at) => {
    const principal: Principal = Object.freeze({ subject: `trusted-${at}` })
    principals.set(principal, scope)
    principalOf.set(textOf(scope), principal)
  })
  const completeWindows = new Set<string>()
  const authority: ModelCommandsAuthority<Principal> = {
    authorize: ({ access, action }) => {
      const scope = principals.get(access.principal)
      return scope !== undefined && tenantEquals(scope, access.tenant)
        ? { ok: { owner: 'identity', subject: access.principal.subject, revision: '1' } }
        : { failure: { kind: 'denied', action } }
    },
    execution: () => ({ ok: { owner: 'host', subject: 'channel', revision: '1' } }),
  }
  const untrusted = (field: string) =>
    ({ failure: { kind: 'invalid', field, reason: 'untrusted' } }) as const
  const evidence: ModelCommandsEvidence = {
    adoption: ADOPTION,
    continuity: i =>
      i.source.owner === 'host' && i.source.record === i.call
        ? { ok: structuredClone(i.source) }
        : untrusted('continuity'),
    materialization: i => ({ ok: proof(`${i.call}/${i.dispatch}`, 'materializer') }),
    lateFact: i =>
      i.source.owner === 'supplier' && i.source.record === `${i.call}/${i.dispatch}`
        ? { ok: i.source }
        : untrusted('source'),
    retry: i =>
      i.source.owner === 'retry' && i.source.record === i.position.operation
        ? { ok: i.source }
        : untrusted('source'),
    handoff: i => {
      const source = i.evidence.kind === 'processed' ? i.evidence.completion : i.evidence.custody
      return source.owner === i.consumer.owner && source.record === `${i.call}/${i.result}`
        ? { ok: source }
        : { failure: { kind: 'handoff-invalid', reason: 'fixture-proof' } }
    },
    receive: i =>
      completeWindows.has(`${i.call}/${i.window}/${i.batchDigest}`)
        ? { ok: { window: i.window, batchDigest: i.batchDigest, paused: true, noPrefetch: true } }
        : {
            failure: {
              kind: 'unavailable',
              dependency: 'receive-record',
              diagnostic: 'complete-window-not-registered',
            },
          },
  }
  const options: ModelCommandsCoreOptions<Principal> = {
    owners: [OWNER],
    authority,
    evidence: [evidence],
    clock: { now: () => '2026-10-19T00:00:00.000Z' },
    limits: {
      scanPageCalls: 2,
      resultPageParts: 1,
      resultPageTargetBytes: 1024,
      readIdleMs: 1000,
      capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
    },
  }
  const admitOf = (scope: TenantId, call: ModelCallId, operation: ModelOperationId) => {
    const principal = principalOf.get(textOf(scope))
    if (principal === undefined) throw new Error('fixture tenant without a principal')
    return {
      principal,
      tenant: scope,
      call,
      operation,
      request: REQUEST,
      consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' },
      capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
    }
  }
  return { options, completeWindows, admitOf }
}

// --- The SQL commands ----------------------------------------------------------------------

export const MAX_CALL_BYTES = 1 << 20

/**
 * The SQL ModelCommands over one test provider. Every tenant in `tenants` is registered in the one
 * transaction domain `domain`, so a statement without its tenant condition meets the rows of the
 * other tenant.
 */
export function sqlCommands(
  tenants: readonly TenantId[],
  overrides: Partial<SqlModelCommandsOptions<Principal>> = {},
  domain = 'shared',
) {
  const sqlite = sqliteStorage()
  const core = coreOptions(tenants)
  const { commands } = createSqlModelCommands<Principal>({
    ...core.options,
    storage: sqlite.storage,
    domains: lookup(tenants.map(textOf), domain),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    maxCallBytes: MAX_CALL_BYTES,
    maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
    ...overrides,
  })
  return { commands, sqlite, core, domain }
}
