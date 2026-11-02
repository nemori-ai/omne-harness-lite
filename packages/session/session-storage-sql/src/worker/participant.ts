// The `session` participant module (SPEC W1 steps 3 to 7, W2 for the shared commit). It runs inside
// the provider's write transaction and uses the pure `decide` and `reduce` of session-contract:
// this file reads their inputs, assigns positions, writes rows and maintains the derived rows. It
// never begins, commits or rolls back, and it writes no rule of its own.
import {
  commandDigest,
  decide,
  judgeIdle,
  reduce,
  type CommitReceipt,
  type DurableEvidence,
  type GuardCommand,
  type HistoryEntry,
  type OperationRecord,
  type ProducerRef,
  type RunId,
  type SessionCallLookup,
  type SessionRunLookup,
  type SessionCommand,
  type SessionFailure,
  type SessionInputScope,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type {
  ParticipantModule,
  ParticipantPort,
  ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import { canonicalText, decodeValue, encodeValue, plainOf, sha256 } from '../codec.ts'
import { runChecks } from './check.ts'
import { judgeEntries, type EntriesBatch } from './entries.ts'
import { readHistory, type SessionHistory } from './history-index.ts'
import { judgeLog, type LogBatch } from './log.ts'
import { PROTOCOL } from './schema.ts'
import { big, oneRow, rowsOf, text, type Row } from './support.ts'

const OWNER = '@omne-harness/session-storage-sql'
const MAX_INITIALIZATION_RECEIPTS = 1000
const MAX_VIEW_ROWS = 100_000

type Decision = ReturnType<typeof decide>
type Reads = Parameters<typeof decide>[4]
type PendingReason = string

const isControl = (command: SessionCommand): boolean =>
  command.kind === 'cancelRun' || command.kind === 'stopCall'

const participated = (result: unknown, recovered: boolean): ParticipantReply => ({
  kind: 'participated',
  response: { result: encodeValue(result), recovered },
})
const stopped = (failure: SessionFailure): ParticipantReply => ({
  kind: 'conflict',
  basis: { failure: encodeValue(failure) },
})

function pendingReasons(snapshot: WorkSnapshot | null): readonly PendingReason[] {
  if (snapshot === null) return []
  const reasons: PendingReason[] = []
  if (snapshot.tasks.some(task => task.kind === 'initialization')) reasons.push('initialization')
  if (snapshot.unresolved.length > 0) reasons.push('unresolved')
  if (snapshot.controls.some(control => control.state === 'propagating')) reasons.push('controls')
  if (snapshot.tasks.length > 0) reasons.push('tasks')
  if (snapshot.pending.length > 0) reasons.push('inputs')
  if (snapshot.run.kind === 'active') reasons.push('run')
  else if (
    snapshot.lifecycle !== 'archived' &&
    snapshot.autoArchive?.kind === 'enabled' &&
    !(snapshot.relation?.kind === 'main' && snapshot.relation.resident)
  )
    reasons.push('idle-armed')
  if (snapshot.consumptions.some(item => item.results.some(result => result.release === 'pending')))
    reasons.push('release')
  return reasons
}

function mint(record: string, content: unknown): DurableEvidence {
  return { owner: OWNER, record, revision: '1', digest: `sha256:${sha256(canonicalText(content))}` }
}

function runLookup(snapshot: WorkSnapshot, run: RunId): SessionRunLookup {
  const history = snapshot.executions?.find(item => item.run === run)
  const current =
    snapshot.run.kind === 'terminal' && snapshot.run.terminal.run === run
      ? snapshot.run.terminal
      : null
  const active = snapshot.run.kind === 'active' && snapshot.run.run === run
  if (history === undefined && current === null && !active)
    return { kind: 'absent' as const, run, covered: snapshot.revision }
  return {
    kind: 'bound' as const,
    run,
    bound: mint(`${snapshot.session}/run/${run}`, { run }),
    terminal: current ?? history?.terminal ?? null,
  }
}

function callLookup(snapshot: WorkSnapshot, producer: ProducerRef): SessionCallLookup {
  return snapshot.consumptions.some(
    item =>
      item.binding.producer.kind === producer.kind && item.binding.producer.call === producer.call,
  )
    ? {
        kind: 'bound' as const,
        producer,
        bound: mint(`${snapshot.session}/call/${producer.kind}/${producer.call}`, producer),
        terminal: null,
      }
    : { kind: 'absent' as const, producer, covered: snapshot.revision }
}

/**
 * The result a command returns, built from the snapshot after its batch (the recall of the original).
 * A control that left no progress item is not reachable, but it answers `null` (unavailable), never
 * throws, as the session-contract double does.
 */
export function resultOf(
  command: SessionCommand,
  snapshot: WorkSnapshot,
  receipt: CommitReceipt,
): unknown {
  switch (command.kind) {
    case 'create':
      return { receipt, state: snapshot }
    case 'startRun': {
      if (snapshot.run.kind !== 'active' || snapshot.run.advance === null)
        throw new Error('startRun committed without an active Run')
      const { advance, adoption, first, execution } = snapshot.run
      return { receipt, advance, adopted: adoption, first, execution: execution.execution }
    }
    case 'claim':
    case 'reload': {
      if (snapshot.run.kind !== 'active' || snapshot.run.advance === null)
        throw new Error(`${command.kind} committed without an advance`)
      return { receipt, advance: snapshot.run.advance }
    }
    case 'finishRun': {
      if (snapshot.run.kind !== 'terminal')
        throw new Error('finishRun committed without a terminal')
      return { receipt, terminal: snapshot.run.terminal }
    }
    case 'preserveResult':
    case 'completeConsumption':
    case 'completeExternalConsumption':
      return receipt.source
    case 'bindExternalCall':
      return {
        receipt,
        consumption: snapshot.consumptions.find(
          item =>
            canonicalText(encodeValue(item.binding)) ===
            canonicalText(encodeValue(command.input.binding)),
        )?.id,
      }
    case 'control':
    case 'interrupt':
      return {
        receipt,
        progress: snapshot.controls.find(item => item.operation === command.input.operation),
      }
    case 'cancelRun':
    case 'stopCall': {
      const progress = snapshot.controls.find(item => item.operation === command.input.operation)
      if (progress === undefined) return null
      return {
        operation: receipt.operation,
        source: receipt.source,
        answer: { kind: 'requested', progress },
      }
    }
    case 'considerAutoArchive':
      return { result: 'archived', receipt }
    default:
      return receipt
  }
}

/** The ordinary input that a command admits, if any, for `readInput`. */
function admittedInput(command: SessionCommand): { input: string } | null {
  if (command.kind === 'accept' && command.input.value.kind === 'ordinary')
    return command.input.value
  if (command.kind === 'create') return command.input.creation.initial ?? null
  if (command.kind === 'interrupt') return command.input.urgent
  return null
}

function autoArchiveResult(snapshot: WorkSnapshot): string {
  const observation = snapshot.idle?.observation
  if (snapshot.autoArchive?.kind !== 'enabled') return 'disabled'
  if (snapshot.relation?.kind === 'main' && snapshot.relation.resident) return 'exempt'
  if (observation === undefined) return 'not-due'
  return judgeIdle(snapshot, {
    observation,
    policy: snapshot.autoArchive,
    coverage:
      observation.kind === 'interval'
        ? observation.coverage
        : {
            own: observation.source,
            relations: observation.source,
            calls: [],
            children: [],
            completeScope: observation.source,
          },
  }).kind
}

type ViewMessage = {
  role?: string
  blocks?: { visibility?: { toModel?: boolean } }[]
  covers?: { to?: unknown }
  retained?: unknown[]
}

function messageOf(entry: HistoryEntry): ViewMessage | null {
  if (!entry.kind.startsWith('message.')) return null
  const message = (plainOf(entry.payload) as { message?: ViewMessage } | null)?.message
  return message ?? null
}

/** Appends the model-visible rows of the batch to the current epoch; a compaction opens a new epoch (W4). */
export function maintainModelView(
  port: ParticipantPort,
  tenant: string,
  session: string,
  epoch: string,
  entries: readonly HistoryEntry[],
  limit: number = MAX_VIEW_ROWS,
): string | null {
  let current = epoch
  const writeRow = (
    at: string,
    seq: bigint,
    entry: string,
    message: ViewMessage,
    prefix: string,
  ): string => {
    const digest = sha256(canonicalText({ prefix, entry, message }))
    port.execute(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        at,
        seq,
        entry,
        BigInt(Buffer.byteLength(JSON.stringify(message))),
        digest,
        JSON.stringify(message),
      ],
    )
    return digest
  }
  for (const entry of entries) {
    const message = messageOf(entry)
    if (
      message === null ||
      message.role === 'tool_internal' ||
      !message.blocks?.some(block => block.visibility?.toModel === true)
    )
      continue
    if (message.role === 'compaction') {
      const old = rowsOf(
        port,
        'SELECT entry, message FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ? ORDER BY seq LIMIT ?',
        [tenant, session, current, BigInt(limit + 1)],
      )
      // A compaction over a partial epoch would drop rows from the model view.
      if (old.length > limit) return null
      const covers = BigInt(String(message.covers?.to ?? 0))
      const retained = new Set((message.retained ?? []).map(ref => String(ref)))
      const kept = old.filter(row => retained.has(text(row['entry'])))
      const after = old.filter(row => BigInt(text(row['entry'])) > covers)
      const next = `epoch:${entry.id}`
      let prefix = ''
      let seq = 0n
      for (const row of [
        ...kept.map(row => ({
          id: text(row['entry']),
          message: JSON.parse(text(row['message'])) as ViewMessage,
        })),
        { id: entry.id, message },
        ...after.map(row => ({
          id: text(row['entry']),
          message: JSON.parse(text(row['message'])) as ViewMessage,
        })),
      ]) {
        seq += 1n
        prefix = writeRow(next, seq, row.id, row.message, prefix)
      }
      current = next
      continue
    }
    const last = oneRow(
      port,
      'SELECT seq, prefix_digest FROM sl_model_view WHERE tenant = ? AND session = ? AND epoch = ? ORDER BY seq DESC LIMIT 1',
      [tenant, session, current],
    )
    writeRow(
      current,
      last === undefined ? 1n : big(last['seq']) + 1n,
      entry.id,
      message,
      last === undefined ? '' : text(last['prefix_digest']),
    )
  }
  return current
}

function maintainDerived(
  port: ParticipantPort,
  tenant: string,
  session: string,
  previous: WorkSnapshot | null,
  snapshot: WorkSnapshot,
): void {
  const before = new Set(pendingReasons(previous))
  const after = new Set(pendingReasons(snapshot))
  for (const reason of before)
    if (!after.has(reason))
      port.execute('DELETE FROM sl_pending_idx WHERE tenant = ? AND reason = ? AND session = ?', [
        tenant,
        reason,
        session,
      ])
  for (const reason of after)
    if (!before.has(reason))
      port.execute('INSERT INTO sl_pending_idx (tenant, reason, session) VALUES (?, ?, ?)', [
        tenant,
        reason,
        session,
      ])
  port.execute('DELETE FROM sl_resident_idx WHERE tenant = ? AND session = ?', [tenant, session])
  if (snapshot.lifecycle !== 'archived')
    for (const pair of snapshot.residentKeys ?? []) {
      const resident = snapshot.residents.find(item => item.capability === pair.capability)
      if (resident !== undefined)
        port.execute(
          'INSERT OR REPLACE INTO sl_resident_idx (resident_key, tenant, session, capability, shape) VALUES (?, ?, ?, ?, ?)',
          [pair.key, tenant, session, pair.capability, JSON.stringify(encodeValue(resident.shape))],
        )
    }
  port.execute('DELETE FROM sl_released_scope_idx WHERE tenant = ? AND session = ?', [
    tenant,
    session,
  ])
  for (const scope of snapshot.releasedScopes ?? [])
    port.execute(
      'INSERT OR REPLACE INTO sl_released_scope_idx (tenant, session, scope, data) VALUES (?, ?, ?, ?)',
      [tenant, session, scope.scope, JSON.stringify(encodeValue(scope))],
    )
}

/** Every operation receipt of the session, in revision order, that completeInitialization recalls. */
export function initializationReceipts(
  port: ParticipantPort,
  tenant: string,
  session: string,
  limit: number = MAX_INITIALIZATION_RECEIPTS,
): CommitReceipt[] | null {
  const rows = rowsOf(
    port,
    'SELECT receipt FROM sl_operation WHERE tenant = ? AND session = ? ORDER BY revision LIMIT ?',
    [tenant, session, BigInt(limit + 1)],
  )
  if (rows.length > limit) return null
  return rows.map(row => JSON.parse(text(row['receipt'])) as CommitReceipt)
}

/**
 * The execution index row of each SE13 (`run.started`) of the batch, in the batch's transaction.
 * An execution is unique within its tenant: a row that already exists, for another session or for
 * the same one, fails the commit and stays as it is.
 */
function indexExecutions(
  port: ParticipantPort,
  tenant: string,
  session: string,
  entries: readonly HistoryEntry[],
): ParticipantReply | null {
  for (const entry of entries) {
    if (entry.kind !== 'run.started') continue
    const { run, execution } = (plainOf(entry.payload) ?? {}) as Record<string, unknown>
    if (typeof run !== 'string' || typeof execution !== 'string')
      return { kind: 'failed', diagnostic: 'an SE13 entry without its Run and execution' }
    const held = oneRow(
      port,
      'SELECT session FROM sl_execution_idx WHERE tenant = ? AND execution = ? LIMIT 1',
      [tenant, execution],
    )
    if (held !== undefined)
      return {
        kind: 'failed',
        diagnostic: `the execution ${execution} is already indexed to ${
          text(held['session']) === session ? 'this session' : 'another session'
        }`,
      }
    port.execute(
      'INSERT INTO sl_execution_idx (tenant, execution, session, run, position) VALUES (?, ?, ?, ?, ?)',
      [tenant, execution, session, run, BigInt(entry.id)],
    )
  }
  return null
}

function writeEntries(
  port: ParticipantPort,
  tenant: string,
  session: string,
  entries: readonly HistoryEntry[],
): ParticipantReply | null {
  for (const entry of entries) {
    const body = JSON.stringify(encodeValue(entry))
    port.execute(
      'INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        BigInt(entry.id),
        BigInt(entry.revision),
        entry.kind,
        body,
        BigInt(Buffer.byteLength(body)),
      ],
    )
    if (entry.kind === 'history.annotated') {
      const targets = (plainOf(entry.payload) as { targets?: unknown } | null)?.targets
      if (Array.isArray(targets))
        for (const target of targets)
          port.execute(
            'INSERT OR IGNORE INTO sl_annotation_idx (tenant, session, target, position) VALUES (?, ?, ?, ?)',
            [tenant, session, BigInt(String(target)), BigInt(entry.id)],
          )
    }
  }
  return indexExecutions(port, tenant, session, entries)
}

/** The receipt of one committed batch: the same for a command batch and an entries batch. */
function batchReceipt(
  input: Readonly<{
    tenant: string
    session: string
    operation: string
    seq: bigint
    revision: string
    entries: readonly HistoryEntry[]
  }>,
): CommitReceipt {
  const { tenant, session, operation, seq, revision, entries } = input
  const firstEntry = entries[0] as HistoryEntry
  const lastEntry = entries[entries.length - 1] as HistoryEntry
  return {
    operation,
    revision,
    first: firstEntry.id,
    last: lastEntry.id,
    recovered: false,
    source: {
      owner: OWNER,
      record: `${tenant}/${session}/${seq}`,
      revision,
      digest: `sha256:${sha256(canonicalText({ operation, first: firstEntry.id, last: lastEntry.id, kinds: entries.map(entry => entry.kind), payload: entries.map(entry => entry.payload) }))}`,
    },
  } as CommitReceipt
}

/** W1 step 7, last: the tail moves only from the tail that the batch was judged on. */
function advanceTail(
  port: ParticipantPort,
  input: Readonly<{
    tenant: string
    session: string
    tail: bigint
    revision: string
    seq: bigint
    epoch: string
  }>,
): ParticipantReply | null {
  const { tenant, session, tail, revision, seq, epoch } = input
  const updated = port.execute(
    'UPDATE sl_journal SET tail = ?, commit_seq = ?, epoch = ? WHERE tenant = ? AND session = ? AND tail = ?',
    [BigInt(revision), seq, epoch, tenant, session, tail],
  )
  return updated.changes === 1n
    ? null
    : { kind: 'failed', diagnostic: 'the conditional tail update changed no row' }
}

function runQuery(
  port: ParticipantPort,
  tenant: string,
  session: string,
  operation: string,
): ParticipantReply {
  if (
    oneRow(port, 'SELECT tail FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1', [
      tenant,
      session,
    ]) === undefined
  )
    return { kind: 'participated', response: { kind: 'no-session' } }
  const row = oneRow(
    port,
    'SELECT form, receipt, result FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [tenant, session, operation],
  )
  const stored =
    row === undefined
      ? undefined
      : oneRow(
          port,
          'SELECT evidence FROM sl_operation_evidence WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
          [tenant, session, operation],
        )
  return {
    kind: 'participated',
    response:
      row === undefined
        ? { kind: 'unknown' }
        : {
            kind: 'operation',
            form: text(row['form']),
            receipt: JSON.parse(text(row['receipt'])) as JsonValue,
            result: JSON.parse(text(row['result'])) as JsonValue,
            evidence:
              stored === undefined ? null : (JSON.parse(text(stored['evidence'])) as JsonValue),
          },
  }
}

/**
 * The snapshot a result carries, with the history index of its pending inputs read from the rows
 * this commit wrote, as `readWork` reads it (the memory pair gives its results the same index).
 * Only the result of `create` carries the snapshot; over the read bound it carries none.
 */
function withIndex(port: ParticipantPort, command: SessionCommand, snapshot: WorkSnapshot) {
  if (command.kind !== 'create') return snapshot
  const tenant = tenantCodec.encode(snapshot.tenant)
  if (!tenant.ok) return snapshot
  const history = readHistory(port, tenant.value, snapshot.session, snapshot, {
    kind: 'pending',
    inputs: snapshot.pending,
  })
  return history === 'too-many' ? snapshot : { ...snapshot, historyIndex: history.index }
}

/** The rows a command is judged on: its key, the record of its identity, the journal and the snapshot. */
type CommandStart = Readonly<{
  tenant: string
  session: string
  operation: string
  held: Row | undefined
  journal: Row | undefined
  previous: WorkSnapshot | null
}>

/** The command, its guards and the access evidence it carries, as the participant received them. */
type Received = Readonly<{
  command: SessionCommand
  guards: readonly GuardCommand[]
  evidence: string | null
}>

/** W1 steps 3 and 4: the key of the command, then its record, its journal row and its snapshot. */
function commandStart(
  command: SessionCommand,
  port: ParticipantPort,
): CommandStart | ParticipantReply {
  // Before the session or any lookup: the answer must not tell what exists.
  if (command.kind === 'stopCall' && command.input.producer.kind === 'tool')
    return stopped({ kind: 'unsupported' })
  const tenantText = tenantCodec.encode(command.input.tenant)
  if (!tenantText.ok)
    return stopped({ kind: 'invalid', field: 'tenant', reason: 'not minted by legal-identity' })
  const tenant = tenantText.value
  const session = command.input.session
  const operation = command.input.operation

  const held = oneRow(
    port,
    'SELECT input_digest, form, receipt, result FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [tenant, session, operation],
  )
  if (held !== undefined && text(held['form']) === 'answer')
    return isControl(command) && text(held['input_digest']) === commandDigest(command)
      ? participated(decodeValue(JSON.parse(text(held['result'])) as JsonValue), true)
      : stopped({ kind: 'conflict', operation })

  const journal = oneRow(
    port,
    'SELECT tail, commit_seq, epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (journal === undefined && command.kind !== 'create')
    return stopped({ kind: 'denied', action: command.kind })
  let previous: WorkSnapshot | null = null
  if (journal !== undefined) {
    const state = oneRow(
      port,
      'SELECT snapshot, covered FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
      [tenant, session],
    )
    if (state === undefined || big(state['covered']) !== big(journal['tail']))
      return { kind: 'failed', diagnostic: 'sl_state does not cover the tail' }
    previous = decodeValue(JSON.parse(text(state['snapshot'])) as JsonValue) as WorkSnapshot
  }
  return { tenant, session, operation, held, journal, previous }
}

const isStart = (value: CommandStart | ParticipantReply): value is CommandStart =>
  !('kind' in value)

/** The reads of `decide` that come from rows: the frozen receipt, the lookups and the receipts. */
function commandReads(
  port: ParticipantPort,
  command: SessionCommand,
  start: CommandStart,
): Reads | ParticipantReply {
  const { tenant, session, previous } = start
  const frozen =
    previous === null
      ? undefined
      : oneRow(
          port,
          `SELECT o.receipt AS receipt FROM sl_entry e JOIN sl_operation o
             ON o.tenant = e.tenant AND o.session = e.session AND o.revision = e.revision
           WHERE e.tenant = ? AND e.session = ? AND e.kind = 'session.frozen' LIMIT 1`,
          [tenant, session],
        )
  // A bound reached by a read inside the commit is a failure (unavailable), never a shorter read.
  const receipts =
    command.kind === 'completeInitialization' ? initializationReceipts(port, tenant, session) : []
  if (receipts === null)
    return {
      kind: 'failed',
      diagnostic: 'the operation receipts of the session exceed the read bound',
    }
  return {
    compaction: null,
    ...(frozen === undefined
      ? {}
      : { frozenReceipt: JSON.parse(text(frozen['receipt'])) as CommitReceipt }),
    ...(command.kind === 'cancelRun' && previous !== null
      ? { runs: [runLookup(previous, command.input.run)] }
      : {}),
    ...(command.kind === 'stopCall' && previous !== null
      ? { calls: [callLookup(previous, command.input.producer)] }
      : {}),
    ...(command.kind === 'completeInitialization'
      ? {
          initializationReceipts: receipts,
        }
      : {}),
  }
}

/** The input range whose history this command reads: its selected inputs, or the pending ones. */
function commandScope(command: SessionCommand, previous: WorkSnapshot | null): SessionInputScope {
  if (command.kind === 'startRun')
    return { kind: 'selected', inputs: (previous?.pending ?? []).slice(0, 1) }
  if (command.kind === 'receive' && command.input.fact.kind === 'input-handover')
    return { kind: 'selected', inputs: [command.input.fact.input] }
  return { kind: 'pending', inputs: previous?.pending ?? [] }
}

/** A control answer is saved under its identity with no revision: it writes no entry. */
function saveControlAnswer(
  port: ParticipantPort,
  received: Received,
  start: CommandStart,
  decision: Extract<Decision, { kind: 'control-answer' }>,
): ParticipantReply {
  const { tenant, session, operation } = start
  const receipt = { operation, source: decision.source, answer: decision.answer }
  port.execute(
    'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)',
    [
      tenant,
      session,
      operation,
      commandDigest(received.command),
      'answer',
      JSON.stringify(encodeValue(receipt)),
      JSON.stringify(encodeValue(receipt)),
    ],
  )
  storeEvidence(port, { tenant, session, operation }, received.evidence)
  return participated(receipt, false)
}

/**
 * The recall of the original operation that `decide` named. A `completeInitialization` that recalls
 * another operation saves its own record with the original receipt.
 */
function recallOriginal(
  port: ParticipantPort,
  received: Received,
  start: CommandStart,
  decision: Extract<Decision, { kind: 'recovered' }>,
): ParticipantReply {
  const { command, evidence } = received
  const { tenant, session, operation, held } = start
  const original = oneRow(
    port,
    'SELECT result, receipt FROM sl_operation WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [tenant, session, decision.receipt.operation],
  )
  if (original === undefined)
    return { kind: 'failed', diagnostic: 'a recalled operation without a record' }
  if (held === undefined && command.kind === 'completeInitialization') {
    port.execute(
      'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        operation,
        commandDigest(command),
        'batch',
        BigInt((JSON.parse(text(original['receipt'])) as CommitReceipt).revision),
        text(original['receipt']),
        text(original['receipt']),
      ],
    )
    storeEvidence(port, { tenant, session, operation }, evidence)
  }
  const value =
    command.kind === 'completeInitialization'
      ? { ...(JSON.parse(text(original['receipt'])) as CommitReceipt), recovered: true }
      : decodeValue(JSON.parse(text(original['result'])) as JsonValue)
  return participated(value, true)
}

/** The judged batch of a command, with what its publication needs. */
type CommandBatch = Readonly<{
  prepared: WorkSnapshot | null
  history: SessionHistory | null
  entries: Extract<Decision, { kind: 'entries' }>['entries']
}>

/** W1 step 7: positions, rows, derived rows, then the conditional tail update. */
function publishCommand(
  port: ParticipantPort,
  received: Received,
  start: CommandStart,
  batch: CommandBatch,
): ParticipantReply {
  const { command, evidence } = received
  const { tenant, session, operation, journal, previous } = start
  const tail = journal === undefined ? 0n : big(journal['tail'])
  const seq = journal === undefined ? 1n : big(journal['commit_seq']) + 1n
  const revision = String(tail + 1n)
  const last = oneRow(
    port,
    'SELECT COALESCE(MAX(position), 0) AS p FROM sl_entry WHERE tenant = ? AND session = ?',
    [tenant, session],
  )
  const first = big(last?.['p'] ?? 0n) + 1n
  const entries: HistoryEntry[] = batch.entries.map((entry, index) => ({
    ...entry,
    id: String(first + BigInt(index)),
    revision,
  })) as HistoryEntry[]
  const reduced = reduce(
    batch.prepared,
    { revision, entries } as never,
    batch.history === null ? undefined : batch.history.reads,
  )
  if (reduced.kind === 'quarantined')
    return { kind: 'failed', diagnostic: `reduce quarantined: ${reduced.diagnostic}` }
  // The index is a read projection of this transaction, never stored in the snapshot row.
  const { historyIndex: _index, ...snapshot } = reduced.snapshot
  const receipt = batchReceipt({ tenant, session, operation, seq, revision, entries })

  const unindexed = writeEntries(port, tenant, session, entries)
  if (unindexed !== null) return unindexed
  const epoch = maintainModelView(
    port,
    tenant,
    session,
    journal === undefined ? 'epoch:0' : text(journal['epoch']),
    entries,
  )
  if (epoch === null)
    return {
      kind: 'failed',
      diagnostic: 'the model view epoch exceeds the read bound of a compaction',
    }
  const admitted = admittedInput(command)
  if (admitted !== null)
    port.execute(
      'INSERT OR REPLACE INTO sl_input (tenant, session, input, value) VALUES (?, ?, ?, ?)',
      [tenant, session, admitted.input, JSON.stringify(encodeValue(admitted))],
    )
  port.execute(
    'INSERT OR REPLACE INTO sl_state (tenant, session, snapshot, covered) VALUES (?, ?, ?, ?)',
    [tenant, session, JSON.stringify(encodeValue(snapshot)), BigInt(revision)],
  )
  maintainDerived(port, tenant, session, previous, snapshot)
  const result = resultOf(command, withIndex(port, command, snapshot), receipt)
  if (result === null)
    return {
      kind: 'failed',
      diagnostic: `${command.kind} committed without a control progress item`,
    }
  port.execute(
    'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      tenant,
      session,
      operation,
      commandDigest(command),
      isControl(command) ? 'control' : 'batch',
      BigInt(revision),
      JSON.stringify(encodeValue(receipt)),
      JSON.stringify(encodeValue(result)),
    ],
  )
  storeEvidence(port, { tenant, session, operation }, evidence)
  if (journal === undefined)
    port.execute(
      'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
      [tenant, session, BigInt(revision), seq, epoch],
    )
  else {
    const moved = advanceTail(port, { tenant, session, tail, revision, seq, epoch })
    if (moved !== null) return moved
  }
  return participated(result, false)
}

function runCommand(
  command: SessionCommand,
  guards: readonly GuardCommand[],
  evidence: string | null,
  port: ParticipantPort,
): ParticipantReply {
  const start = commandStart(command, port)
  if (!isStart(start)) return start
  const { tenant, session, held, previous } = start
  const record: OperationRecord | null =
    held === undefined
      ? null
      : {
          operation: command.input.operation,
          digest: text(held['input_digest']),
          receipt: JSON.parse(text(held['receipt'])) as CommitReceipt,
        }
  const reads = commandReads(port, command, start)
  if ('kind' in reads) return reads
  // The history index is read in the same transaction as the snapshot, for the input range of this command.
  const history =
    previous === null
      ? null
      : readHistory(port, tenant, session, previous, commandScope(command, previous))
  if (history === 'too-many')
    return { kind: 'failed', diagnostic: 'the history index of the session exceeds the read bound' }
  const prepared =
    history === null || previous === null ? previous : { ...previous, historyIndex: history.index }
  const decision: Decision = decide(prepared, command, guards, record, {
    ...reads,
    ...(history === null ? {} : { history: history.reads }),
  })

  const received: Received = { command, guards, evidence }
  if (decision.kind === 'rejected') return stopped(decision.failure)
  if (decision.kind === 'control-answer') return saveControlAnswer(port, received, start, decision)
  if (decision.kind === 'recovered') return recallOriginal(port, received, start, decision)
  if (decision.entries.length === 0 && command.kind === 'considerAutoArchive' && previous !== null)
    return participated({ result: autoArchiveResult(previous), receipt: null }, false)
  return publishCommand(port, received, start, { prepared, history, entries: decision.entries })
}

/** What a same-log batch publishes: its rows, its snapshot and the record of its operation. */
type SameLogBatch = EntriesBatch | LogBatch
type SameLogRecord = Readonly<{ form: 'entries' | 'log'; receipt: unknown; result: unknown }>

/**
 * One same-log interpretation commit (entries or log channel): the consequence rows, the progress
 * row, the model view, the snapshot, the derived rows, the operation record and the tail, in this
 * one transaction. A failure at any step rolls all of them back.
 */
function publishSameLog(
  port: ParticipantPort,
  batch: SameLogBatch,
  record: (receipt: CommitReceipt) => SameLogRecord,
): ParticipantReply {
  const { tenant, session, operation, journal, previous, snapshot, entries } = batch
  const revision = String(journal.tail + 1n)
  const receipt = batchReceipt({ tenant, session, operation, seq: journal.seq, revision, entries })
  const unindexed = writeEntries(port, tenant, session, entries)
  if (unindexed !== null) return unindexed
  const epoch = maintainModelView(port, tenant, session, journal.epoch, entries)
  if (epoch === null)
    return {
      kind: 'failed',
      diagnostic: 'the model view epoch exceeds the read bound of a compaction',
    }
  port.execute(
    'INSERT OR REPLACE INTO sl_state (tenant, session, snapshot, covered) VALUES (?, ?, ?, ?)',
    [tenant, session, JSON.stringify(encodeValue(snapshot)), BigInt(revision)],
  )
  maintainDerived(port, tenant, session, previous, snapshot)
  const saved = record(receipt)
  port.execute(
    'INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      tenant,
      session,
      operation,
      batch.digest,
      saved.form,
      BigInt(revision),
      JSON.stringify(encodeValue(saved.receipt)),
      JSON.stringify(encodeValue(saved.result)),
    ],
  )
  const moved = advanceTail(port, {
    tenant,
    session,
    tail: journal.tail,
    revision,
    seq: journal.seq,
    epoch,
  })
  return moved ?? participated(batch.answer, false)
}

/** The answer of a same-log commit carries the digest of its observation (SL07). */
function withDigest(reply: ParticipantReply, digest: string, extra: object = {}): ParticipantReply {
  return reply.kind === 'participated'
    ? { kind: 'participated', response: { ...(reply.response as object), ...extra, digest } }
    : reply
}

/** The entries interpretation commit. Its record keeps the batch receipt and the entries receipt. */
function runEntries(facts: Readonly<Record<string, JsonValue>>, port: ParticipantPort) {
  const judged = judgeEntries(facts, port)
  switch (judged.kind) {
    case 'unsupported':
      return { kind: 'unsupported', basis: { reason: judged.reason } } as const
    case 'stopped':
      return stopped(judged.failure)
    case 'failed':
      return { kind: 'failed', diagnostic: judged.diagnostic } as const
    case 'recovered':
      return withDigest(participated(judged.result, true), judged.digest)
    case 'publish':
      return withDigest(
        publishSameLog(port, judged.batch, receipt => ({
          form: 'entries',
          receipt,
          result: judged.batch.answer,
        })),
        judged.batch.digest,
      )
  }
}

/**
 * The event channel interpretation commit. Its record keeps the log receipt in both columns: it is
 * neither a batch nor a control record. A recall of another operation's interpretation and a
 * refusal save no record of this identity, and say so (`recorded`), so the lookup reads this
 * identity as unknown.
 */
function runLog(facts: Readonly<Record<string, JsonValue>>, port: ParticipantPort) {
  const judged = judgeLog(facts, port)
  switch (judged.kind) {
    case 'unsupported':
      return { kind: 'unsupported', basis: { reason: judged.reason } } as const
    case 'stopped':
      return {
        kind: 'conflict',
        basis: { failure: encodeValue(judged.failure), recorded: false },
      } as const
    case 'failed':
      return { kind: 'failed', diagnostic: judged.diagnostic } as const
    case 'recovered':
      return withDigest(participated(judged.result, true), judged.digest, {
        recorded: judged.recorded,
      })
    case 'publish': {
      const { answer } = judged.batch
      return withDigest(
        publishSameLog(port, judged.batch, () => ({
          form: 'log',
          receipt: answer,
          result: answer,
        })),
        judged.batch.digest,
        { recorded: true },
      )
    }
  }
}

/**
 * The access evidence that a command carries, as the JSON text stored with its operation record.
 * Absent is `null` (no decision travelled); a value that is not a durable evidence is `malformed`.
 */
function evidenceOf(value: JsonValue | undefined): string | null | 'malformed' {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return 'malformed'
  const { owner, record, revision, digest } = value as Readonly<Record<string, JsonValue>>
  return [owner, record, revision, digest].every(member => typeof member === 'string')
    ? JSON.stringify({ owner, record, revision, digest })
    : 'malformed'
}

/** The evidence row of an operation record, in the transaction that writes the record. */
function storeEvidence(
  port: ParticipantPort,
  key: Readonly<{ tenant: string; session: string; operation: string }>,
  evidence: string | null,
): void {
  if (evidence === null) return
  port.execute(
    'INSERT INTO sl_operation_evidence (tenant, session, operation, evidence) VALUES (?, ?, ?, ?)',
    [key.tenant, key.session, key.operation, evidence],
  )
}

/** The command intent: the command with its guards and evidence, answered with its digest. */
function runCommandFacts(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
): ParticipantReply {
  if (typeof facts['command'] !== 'object' || !Array.isArray(facts['guards']))
    return {
      kind: 'unsupported',
      basis: {
        reason: 'the facts are neither a command, a check, a same-log commit nor a query',
      },
    }
  let command: SessionCommand
  let guards: GuardCommand[]
  try {
    command = decodeValue(facts['command'] as JsonValue) as SessionCommand
    guards = decodeValue(facts['guards'] as JsonValue) as GuardCommand[]
  } catch (error) {
    return {
      kind: 'unsupported',
      basis: { reason: error instanceof Error ? error.message : 'undecodable facts' },
    }
  }
  const evidence = evidenceOf(facts['evidence'])
  if (evidence === 'malformed')
    return {
      kind: 'unsupported',
      basis: { reason: 'the access evidence of the command is not a durable evidence' },
    }
  const reply = runCommand(command, guards, evidence, port)
  // The digest of the command travels with the answer, so a later caller can tell a recall of the
  // same command from the same identity used for another command (SL07).
  return reply.kind === 'participated'
    ? {
        kind: 'participated',
        response: { ...(reply.response as object), digest: commandDigest(command) },
      }
    : reply
}

/** The query intent: the original record of one operation identity. */
function runQueryFacts(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
): ParticipantReply {
  const { tenant, session, operation } = facts as Record<string, unknown>
  return typeof tenant === 'string' && typeof session === 'string' && typeof operation === 'string'
    ? runQuery(port, tenant, session, operation)
    : { kind: 'unsupported', basis: { reason: 'query facts are incomplete' } }
}

const participant: ParticipantModule = {
  participant: 'session',
  protocol: PROTOCOL,
  execute(facts, port) {
    switch (facts['intent']) {
      case 'query':
        return runQueryFacts(facts, port)
      case 'entries':
        return runEntries(facts, port)
      case 'log':
        return runLog(facts, port)
      case 'check':
        return runChecks(facts, port)
      case 'command':
        return runCommandFacts(facts, port)
      default:
        return {
          kind: 'unsupported',
          basis: {
            reason: 'the facts are neither a command, a check, a same-log commit nor a query',
          },
        }
    }
  },
}
export default participant
