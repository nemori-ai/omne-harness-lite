import {
  maintainModelView,
  writeEntries,
  batchReceipt,
  advanceTail,
  insertOperation,
  storeEvidence,
} from './commit-write.ts'
import { runCompactionCommand } from './compaction-command.ts'
import { writePermissionCurrent } from './permission-current.ts'
import { writeCompactionIndex } from './compaction-index.ts'
import { callsLeft, lentTo, writeCallsLeft, type CallsLeft } from './call-left.ts'
import { pendingReasons } from './pending-reasons.ts'
import { readSessionBasis } from './session-basis.ts'
import { SESSION_COMMIT_PROTOCOL, type SessionCommitBasis } from '../commit-basis.ts'
import type { SessionPermissionChangeBasis } from '@omne-harness/session-contract'
import {
  commandDigest,
  controlAnswer,
  sessionIntakeLimits,
  type SessionIntakeLimits,
  childRecorded,
  consumptionIdOf,
  decide,
  judgeIdle,
  reduce,
  type CommitReceipt,
  type GuardCommand,
  type HistoryEntry,
  type OperationRecord,
  type ResidentTool,
  type SessionCommand,
  type SessionFailure,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  type ParticipantModule,
  type ParticipantPort,
  type ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import { decodeValue, encodeValue, plainOf } from '../codec.ts'
import { runChecks } from './check.ts'
import { commandReads, journalOf } from './command-reads.ts'
import { judgeEntries, type EntriesBatch } from './entries.ts'
import { admittedInputs, writeInputs } from './input-rows.ts'
import { LogGap, readHistory, type HistoryBasis, type SessionHistory } from './history-index.ts'
import { commandBasis, commandHistory } from './command-history.ts'
import { judgeLog, readCoveringHead, type CoveringSnapshot, type LogBatch } from './log.ts'
import type { SessionWorkReply } from '../participants.ts'
import { writeSessionList } from './session-list.ts'
import { assemble, deepFreeze, writeState, type StoredState } from './state-rows.ts'
import {
  assignPositions,
  big,
  definite,
  definiteBasis,
  oneRow,
  packed,
  readVersion,
  refusingMalformedEntries,
  text,
  type Row,
} from './support.ts'

export const PARTICIPANT_SNAPSHOT_SESSIONS = 256
export const PARTICIPANT_SNAPSHOT_TEXT = 64 * 1024 * 1024

type ParsedEntry = Readonly<{
  covered: bigint
  text: string
  bytes: number
  snapshot: WorkSnapshot
}>

// Reuse a kept snapshot only when the head text equals the one it was kept with, not on revision alone: a revision does not tell databases apart and a rolled-back write can leave a revision that is written again with other content.
export class ParsedSnapshots {
  private readonly entries = new Map<string, ParsedEntry>()
  private readonly sessions: number
  private readonly textLimit: number
  private held = 0

  constructor(
    sessions: number = PARTICIPANT_SNAPSHOT_SESSIONS,
    textLimit: number = PARTICIPANT_SNAPSHOT_TEXT,
  ) {
    this.sessions = sessions
    this.textLimit = textLimit
  }

  readonly covering: CoveringSnapshot = (port, tenant, session, tail) => {
    const key = JSON.stringify([tenant, session])
    const kept = this.entries.get(key)
    if (kept !== undefined) this.forget(key, kept)
    const read = readCoveringHead(port, tenant, session, tail)
    if (read === 'behind') return read
    if (kept !== undefined && kept.text === read) {
      this.keep(key, { ...kept, covered: tail })
      return kept.snapshot
    }
    const stored = assemble(port, tenant, session, read)
    const snapshot = deepFreeze(stored.snapshot)
    this.keep(key, { covered: tail, text: read, bytes: stored.layout.bytes, snapshot })
    return snapshot
  }

  wrote(tenant: string, session: string, covered: bigint, stored: StoredState): void {
    const key = JSON.stringify([tenant, session])
    const kept = this.entries.get(key)
    if (kept !== undefined) this.forget(key, kept)
    const { head, bytes } = stored.layout
    this.keep(key, { covered, text: head, bytes, snapshot: deepFreeze(stored.snapshot) })
  }

  peek(tenant: string, session: string): ParsedEntry | undefined {
    return this.entries.get(JSON.stringify([tenant, session]))
  }

  get size(): Readonly<{ sessions: number; text: number }> {
    return { sessions: this.entries.size, text: this.held }
  }

  clear(): void {
    this.entries.clear()
    this.held = 0
  }

  private forget(key: string, entry: ParsedEntry): void {
    this.entries.delete(key)
    this.held -= entry.bytes
  }

  private keep(key: string, entry: ParsedEntry): void {
    if (this.sessions <= 0 || entry.bytes > this.textLimit) return
    this.entries.set(key, entry)
    this.held += entry.bytes
    for (const [oldest, old] of this.entries) {
      if (this.entries.size <= this.sessions && this.held <= this.textLimit) break
      this.forget(oldest, old)
    }
  }
}

export const parsedSnapshots = new ParsedSnapshots()

type Decision = ReturnType<typeof decide>

const isControl = (command: SessionCommand): boolean =>
  command.kind === 'cancelRun' || command.kind === 'stopCall'

const participated = (
  result: unknown,
  recovered: boolean,
  work?: JsonValue,
  batch?: JsonValue,
): ParticipantReply => ({
  kind: 'participated',
  response: {
    result: encodeValue(result),
    recovered,
    ...(work === undefined ? {} : { work }),
    ...(batch === undefined ? {} : { batch }),
  },
})

export const WORK_BASIS_BYTES = 16 * 1024

function workOf(
  port: ParticipantPort,
  input: Readonly<{
    tenant: string
    session: string
    revision: string
    bytes: number
    entries: readonly HistoryEntry[]
    decided: HistoryBasis | 'none'
  }>,
): SessionWorkReply {
  const { tenant, session, revision, bytes, entries, decided } = input
  const work: SessionWorkReply = {
    tail: revision,
    // Read after this transaction moved the journal row to revision.
    published: readVersion(port, { tenant, session })?.published ?? '0',
    bytes,
    first: (entries[0] as HistoryEntry).id,
    last: (entries[entries.length - 1] as HistoryEntry).id,
    indexed: decided !== 'none',
  }
  if (decided === 'none') return work
  const encoded = encodeValue(decided)
  return JSON.stringify(encoded).length > WORK_BASIS_BYTES ? work : { ...work, basis: encoded }
}

const stopped = (failure: SessionFailure): ParticipantReply => ({
  kind: 'conflict',
  basis: { failure: encodeValue(failure) },
})

export function resultOf(
  command: SessionCommand,
  snapshot: WorkSnapshot,
  receipt: CommitReceipt,
): unknown {
  switch (command.kind) {
    case 'addTodo':
    case 'removeTodo':
    case 'markTodoComplete': {
      const item = snapshot.todos?.find(todo =>
        command.kind === 'addTodo'
          ? todo.createdAt === receipt.revision
          : todo.id === command.input.item,
      )
      return item === undefined ? null : { receipt, item }
    }
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
      return { receipt, consumption: consumptionIdOf(command.input.binding) }
    case 'control':
    case 'interrupt':
      return { receipt, ...controlAnswer(snapshot, command) }
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

function autoArchiveResult(snapshot: WorkSnapshot): string {
  const observation = snapshot.idle?.observation
  if (snapshot.autoArchive?.kind !== 'enabled') return 'disabled'
  if (snapshot.resident === true) return 'exempt'
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

type ResidentRow = Readonly<{ key: string; capability: string; shape: ResidentTool['shape'] }>

const shapeText = (row: ResidentRow): string => JSON.stringify(encodeValue(row.shape))

function residentRows(snapshot: WorkSnapshot | null): ReadonlyMap<string, ResidentRow> {
  const rows = new Map<string, ResidentRow>()
  if (snapshot === null || snapshot.lifecycle === 'archived') return rows
  for (const pair of snapshot.residentKeys ?? []) {
    const resident = snapshot.residents.find(item => item.capability === pair.capability)
    if (resident !== undefined)
      rows.set(JSON.stringify([pair.key, pair.capability]), {
        key: pair.key,
        capability: pair.capability,
        shape: resident.shape,
      })
  }
  return rows
}

export function maintainDerived(
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
  const indexed = residentRows(previous)
  const residents = residentRows(snapshot)
  for (const [id, row] of indexed)
    if (!residents.has(id))
      port.execute(
        'DELETE FROM sl_resident_idx WHERE resident_key = ? AND tenant = ? AND session = ? AND capability = ?',
        [row.key, tenant, session, row.capability],
      )
  for (const [id, row] of residents) {
    const old = indexed.get(id)
    if (old !== undefined && (old.shape === row.shape || shapeText(old) === shapeText(row)))
      continue
    port.execute(
      'INSERT OR REPLACE INTO sl_resident_idx (resident_key, tenant, session, capability, shape) VALUES (?, ?, ?, ?, ?)',
      [row.key, tenant, session, row.capability, shapeText(row)],
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
  for (const binding of snapshot.contextScopes ?? [])
    port.execute(
      'INSERT OR IGNORE INTO sl_scope_idx (tenant, scope, session, generation) VALUES (?, ?, ?, ?)',
      [tenant, binding.scope, session, binding.generation],
    )
}

type Written = Readonly<{ kind: 'written'; epoch: string; bytes: number; batch: JsonValue }>

function writeBatch(
  port: ParticipantPort,
  batch: Readonly<{
    tenant: string
    session: string
    revision: string
    epoch: string
    previous: WorkSnapshot | null
    snapshot: WorkSnapshot
    entries: readonly HistoryEntry[]
    receipt: CommitReceipt
    seq: bigint
    at: string | null
    left: CallsLeft
  }>,
): Written | ParticipantReply {
  const { tenant, session, revision, previous, snapshot, entries, receipt } = batch
  const unindexed = writeEntries(port, tenant, session, entries)
  if (unindexed !== null) return unindexed
  const epoch = maintainModelView(port, tenant, session, batch.epoch, entries)
  if (epoch === null)
    return definite('read-bound', 'the model view epoch exceeds the read bound of a compaction')
  const covered = BigInt(revision)
  const stored = writeState(port, { tenant, session, covered }, previous, snapshot)
  parsedSnapshots.wrote(tenant, session, covered, stored)
  writeCallsLeft(port, { tenant, session }, covered, batch.left)
  writeCompactionIndex(port, { tenant, session, previous, snapshot, entries })
  writePermissionCurrent(port, { tenant, session }, previous, snapshot, entries)
  maintainDerived(port, tenant, session, previous, snapshot)
  writeSessionList(port, {
    tenant,
    session,
    seq: batch.seq,
    at: batch.at,
    previous,
    snapshot,
    entries,
  })
  return {
    kind: 'written',
    epoch,
    bytes: stored.layout.bytes,
    batch: {
      tenant,
      session,
      revision,
      source: receipt.source,
      kinds: [...new Set(entries.map(entry => entry.kind))],
    },
  }
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
            receipt: JSON.parse(packed(row['receipt'])) as JsonValue,
            result: JSON.parse(packed(row['result'])) as JsonValue,
            evidence:
              stored === undefined ? null : (JSON.parse(text(stored['evidence'])) as JsonValue),
          },
  }
}

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

type CommandStart = Readonly<{
  tenant: string
  session: string
  operation: string
  held: Row | undefined
  journal: Row | undefined
  previous: WorkSnapshot | null
}>

type Received = Readonly<{
  command: SessionCommand
  guards: readonly GuardCommand[]
  evidence: string | null
  at: string | null
}>

function commandStart(
  command: SessionCommand,
  port: ParticipantPort,
): CommandStart | ParticipantReply {
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
      ? participated(decodeValue(JSON.parse(packed(held['result'])) as JsonValue), true)
      : stopped({ kind: 'conflict', operation })

  const journal = oneRow(
    port,
    'SELECT tail, commit_seq, epoch FROM sl_journal WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (journal === undefined && command.kind !== 'create')
    return stopped({ kind: 'denied', action: command.kind })
  const previous =
    journal === undefined
      ? null
      : parsedSnapshots.covering(port, tenant, session, big(journal['tail']))
  if (previous === 'behind')
    return { kind: 'failed', diagnostic: 'sl_state does not cover the tail' }
  return { tenant, session, operation, held, journal, previous }
}

const isStart = (value: CommandStart | ParticipantReply): value is CommandStart =>
  !('kind' in value)

/** The log of the parent takes its entry in the transaction that creates the child. */
function withChildRecord(
  port: ParticipantPort,
  received: Received,
  tenant: string,
  settled: ParticipantReply,
): ParticipantReply {
  const { command } = received
  const record = command.kind === 'create' ? childRecorded(command.input) : null
  if (record === null) return settled
  const session = record.parent
  const journal = journalOf(port, { tenant, session }, parsedSnapshots.covering)
  if (journal === null) return definite('missing-row', 'a child was created under no parent')
  if ('kind' in journal) return journal
  const { tail, seq, epoch, work: previous } = journal
  const revision = String(tail + 1n)
  const entries = assignPositions(port, { tenant, session }, revision, [record.entry])
  const reduced = reduce(
    previous,
    { revision, entries } as never,
    undefined,
    callsLeft(port, { tenant, session }),
  )
  if (reduced.kind === 'quarantined')
    return definite('quarantined', `reduce quarantined: ${reduced.diagnostic}`)
  const batch: ChildRecordBatch = {
    tenant,
    session,
    operation: record.operation,
    digest: commandDigest(command),
    journal: { tail, seq, epoch },
    previous,
    snapshot: reduced.snapshot,
    entries,
    left: reduced,
    answer: null,
  }
  const reply = publishSameLog(port, batch, received.at, receipt => ({
    form: 'batch',
    receipt,
    result: receipt,
  }))
  return reply.kind === 'participated' ? settled : reply
}

function saveControlAnswer(
  port: ParticipantPort,
  received: Received,
  start: CommandStart,
  decision: Extract<Decision, { kind: 'control-answer' }>,
): ParticipantReply {
  const { tenant, session, operation } = start
  const receipt = { operation, source: decision.source, answer: decision.answer }
  insertOperation(port, {
    tenant,
    session,
    operation,
    digest: commandDigest(received.command),
    form: 'answer',
    revision: null,
    receipt: JSON.stringify(encodeValue(receipt)),
    result: JSON.stringify(encodeValue(receipt)),
  })
  storeEvidence(port, { tenant, session, operation }, received.evidence)
  return participated(receipt, false)
}

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
    return definite('missing-row', 'a recalled operation without a record')
  const receipt = packed(original['receipt'])
  if (held === undefined && command.kind === 'completeInitialization') {
    insertOperation(port, {
      tenant,
      session,
      operation,
      digest: commandDigest(command),
      form: 'batch',
      revision: BigInt((JSON.parse(receipt) as CommitReceipt).revision),
      receipt,
      result: receipt,
    })
    storeEvidence(port, { tenant, session, operation }, evidence)
  }
  const value =
    command.kind === 'completeInitialization'
      ? { ...(JSON.parse(receipt) as CommitReceipt), recovered: true }
      : decodeValue(JSON.parse(packed(original['result'])) as JsonValue)
  return participated(value, true)
}

type CommandBatch = Readonly<{
  prepared: WorkSnapshot | null
  history: SessionHistory | null
  basis: HistoryBasis | null
  entries: Extract<Decision, { kind: 'entries' }>['entries']
  admitted?: Extract<Decision, { kind: 'entries' }>['admitted']
}>

function publishCommand(
  port: ParticipantPort,
  received: Received,
  start: CommandStart,
  batch: CommandBatch,
): ParticipantReply {
  const { command, evidence } = received
  const { tenant, session, operation, journal, previous } = start
  const { tail, seq, revision, entries } = positioned(port, start, batch)
  const reduced = reduce(
    batch.prepared,
    { revision, entries } as never,
    batch.history === null ? undefined : batch.history.reads,
    callsLeft(port, { tenant, session }),
  )
  if (reduced.kind === 'quarantined')
    return definite('quarantined', `reduce quarantined: ${reduced.diagnostic}`)
  const { historyIndex: _index, ...snapshot } = reduced.snapshot
  const receipt = batchReceipt({ tenant, session, operation, seq, revision, entries })

  const written = writeBatch(port, {
    tenant,
    session,
    revision,
    epoch: journal === undefined ? 'epoch:0' : text(journal['epoch']),
    previous,
    snapshot,
    entries,
    receipt,
    seq,
    at: received.at,
    left: reduced,
  })
  if (written.kind !== 'written') return written
  const { epoch, bytes, batch: committed } = written
  const granted = recordAttemptGrants(port, { tenant, session, entries, receipt })
  if (granted !== null) return granted
  writeInputs(port, { tenant, session }, admittedInputs(command, batch.admitted))
  const result = resultOf(command, withIndex(port, command, snapshot), receipt)
  if (result === null)
    return {
      kind: 'failed',
      diagnostic: `${command.kind} committed without a control progress item`,
    }
  insertOperation(port, {
    tenant,
    session,
    operation,
    digest: commandDigest(command),
    form: isControl(command) ? 'control' : 'batch',
    revision: BigInt(revision),
    receipt: JSON.stringify(encodeValue(receipt)),
    result: JSON.stringify(encodeValue(result)),
  })
  storeEvidence(port, { tenant, session, operation }, evidence)
  const moved = moveJournal(port, start, { tail, revision, seq, epoch })
  if (moved !== null) return moved
  const work =
    batch.history === null || batch.basis === null
      ? undefined
      : workOf(port, {
          tenant,
          session,
          revision,
          bytes,
          entries,
          decided: batch.basis,
        })
  const settled = participated(result, false, work, committed)
  return withChildRecord(port, received, tenant, settled)
}

function positioned(port: ParticipantPort, start: CommandStart, batch: CommandBatch) {
  const { tenant, session, journal } = start
  const tail = journal === undefined ? 0n : big(journal['tail'])
  const seq = journal === undefined ? 1n : big(journal['commit_seq']) + 1n
  const revision = String(tail + 1n)
  const entries = assignPositions(port, { tenant, session }, revision, batch.entries)
  return { tail, seq, revision, entries }
}

function moveJournal(
  port: ParticipantPort,
  start: CommandStart,
  move: Readonly<{ tail: bigint; revision: string; seq: bigint; epoch: string }>,
): ParticipantReply | null {
  const { tenant, session, journal } = start
  const { tail, revision, seq, epoch } = move
  if (journal !== undefined)
    return advanceTail(port, { tenant, session, tail, revision, seq, epoch })
  port.execute(
    'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
    [tenant, session, BigInt(revision), seq, epoch],
  )
  return null
}

function recordOf(command: SessionCommand, start: CommandStart): OperationRecord | null {
  const { held } = start
  return held === undefined
    ? null
    : {
        operation: command.input.operation,
        digest: text(held['input_digest']),
        receipt: JSON.parse(packed(held['receipt'])) as CommitReceipt,
      }
}

function settleDecision(
  port: ParticipantPort,
  received: Received,
  start: CommandStart,
  decision: Decision,
  judged: Omit<CommandBatch, 'entries'>,
): ParticipantReply {
  const { command } = received
  const { previous } = start
  if (decision.kind === 'rejected') return stopped(decision.failure)
  if (decision.kind === 'control-answer') return saveControlAnswer(port, received, start, decision)
  if (decision.kind === 'recovered') return recallOriginal(port, received, start, decision)
  if (decision.entries.length === 0 && command.kind === 'considerAutoArchive' && previous !== null)
    return participated({ result: autoArchiveResult(previous), receipt: null }, false)
  return publishCommand(port, received, start, { ...judged, ...decision })
}

function runCommand(
  received: Received,
  port: ParticipantPort,
  intakeLimits: SessionIntakeLimits,
  permissionChange: SessionPermissionChangeBasis | undefined,
): ParticipantReply {
  const { command, guards } = received
  if (command.kind === 'commitDerived' && command.input.value.kind === 'compaction')
    return runCompactionCommand(port, command, received.evidence, received.at)
  const start = commandStart(command, port)
  if (!isStart(start)) return start
  const reads = commandReads(port, command, start, parsedSnapshots.covering)
  if ('kind' in reads) return reads
  const basis = commandBasis(command, start.previous)
  const history = commandHistory(port, start, basis)
  if (history === 'too-many')
    return definite('read-bound', 'the history index of the session exceeds the read bound')
  const { previous } = start
  const prepared =
    history === null || previous === null ? previous : { ...previous, historyIndex: history.index }
  const lent = lentTo(port, start, prepared, command)
  const decision: Decision = decide(lent, command, guards, recordOf(command, start), {
    ...reads,
    ...(permissionChange === undefined ? {} : { permissionChange }),
    intakeLimits,
    ...(history === null ? {} : { history: history.reads }),
  })
  return settleDecision(port, received, start, decision, { prepared, history, basis })
}

type ChildRecordBatch = Omit<EntriesBatch, 'admitted' | 'answer'> & Readonly<{ answer: null }>
type SameLogBatch = EntriesBatch | LogBatch | ChildRecordBatch
type SameLogRecord = Readonly<{
  form: 'entries' | 'log' | 'batch'
  receipt: unknown
  result: unknown
}>

function publishSameLog(
  port: ParticipantPort,
  batch: SameLogBatch,
  at: string | null,
  record: (receipt: CommitReceipt) => SameLogRecord,
): ParticipantReply {
  const { tenant, session, operation, journal, previous, snapshot, entries } = batch
  const revision = String(journal.tail + 1n)
  const receipt = batchReceipt({ tenant, session, operation, seq: journal.seq, revision, entries })
  const written = writeBatch(port, {
    tenant,
    session,
    revision,
    epoch: journal.epoch,
    previous,
    snapshot,
    entries,
    receipt,
    seq: journal.seq,
    at,
    left: batch.left,
  })
  if (written.kind !== 'written') return written
  const { epoch, bytes, batch: committed } = written
  const granted = recordAttemptGrants(port, { tenant, session, entries, receipt })
  if (granted !== null) return granted
  writeInputs(port, { tenant, session }, 'admitted' in batch ? batch.admitted : [])
  const saved = record(receipt)
  insertOperation(port, {
    tenant,
    session,
    operation,
    digest: batch.digest,
    form: saved.form,
    revision: BigInt(revision),
    receipt: JSON.stringify(encodeValue(saved.receipt)),
    result: JSON.stringify(encodeValue(saved.result)),
  })
  const moved = advanceTail(port, {
    tenant,
    session,
    tail: journal.tail,
    revision,
    seq: journal.seq,
    epoch,
  })
  if (moved !== null) return moved
  const decided = 'decision' in batch ? batch.decision : 'none'
  return participated(
    batch.answer,
    false,
    workOf(port, { tenant, session, revision, bytes, entries, decided }),
    committed,
  )
}

function withDigest(reply: ParticipantReply, digest: string, extra: object = {}): ParticipantReply {
  return reply.kind === 'participated'
    ? { kind: 'participated', response: { ...(reply.response as object), ...extra, digest } }
    : reply
}

function runEntries(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
  at: string | null,
) {
  const judged = judgeEntries(facts, port, parsedSnapshots.covering)
  switch (judged.kind) {
    case 'unsupported':
      return { kind: 'unsupported', basis: { reason: judged.reason } } as const
    case 'stopped':
      return stopped(judged.failure)
    case 'definite':
      return definite(judged.failure, judged.diagnostic)
    case 'failed':
      return { kind: 'failed', diagnostic: judged.diagnostic } as const
    case 'recovered':
      return withDigest(participated(judged.result, true), judged.digest)
    case 'publish':
      return withDigest(
        publishSameLog(port, judged.batch, at, receipt => ({
          form: 'entries',
          receipt,
          result: judged.batch.answer,
        })),
        judged.batch.digest,
      )
  }
}

function runLog(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
  at: string | null,
) {
  const judged = judgeLog(facts, port, parsedSnapshots.covering)
  switch (judged.kind) {
    case 'unsupported':
      return { kind: 'unsupported', basis: { reason: judged.reason } } as const
    case 'stopped':
      return {
        kind: 'conflict',
        basis: { failure: encodeValue(judged.failure), recorded: false },
      } as const
    case 'definite':
      return {
        kind: 'conflict',
        basis: { ...definiteBasis(judged.failure, judged.diagnostic), recorded: false },
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
        publishSameLog(port, judged.batch, at, () => ({
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

function evidenceOf(value: JsonValue | undefined): string | null | 'malformed' {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return 'malformed'
  const { owner, record, revision, digest } = value as Readonly<Record<string, JsonValue>>
  return [owner, record, revision, digest].every(member => typeof member === 'string')
    ? JSON.stringify({ owner, record, revision, digest })
    : 'malformed'
}

function recordAttemptGrants(
  port: ParticipantPort,
  input: Readonly<{
    tenant: string
    session: string
    entries: readonly HistoryEntry[]
    receipt: CommitReceipt
  }>,
): ParticipantReply | null {
  const { tenant, session, entries, receipt } = input
  for (const entry of entries) {
    if (entry.kind !== 'run.attempt-started') continue
    const { attempt } = (plainOf(entry.payload) ?? {}) as Record<string, unknown>
    if (typeof attempt !== 'string')
      return { kind: 'failed', diagnostic: 'an SE15 entry without its attempt' }
    port.execute(
      'INSERT INTO sl_attempt_grant (tenant, session, attempt, position, grant) VALUES (?, ?, ?, ?, ?)',
      [tenant, session, attempt, BigInt(entry.id), JSON.stringify(encodeValue(receipt.source))],
    )
  }
  return null
}

function intakeLimitsOf(value: JsonValue | undefined): SessionIntakeLimits | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  if (!('maxPendingInputs' in value) || !('maxInputBytes' in value)) return null
  const { maxPendingInputs, maxInputBytes } = value
  if (typeof maxPendingInputs !== 'number' || typeof maxInputBytes !== 'number') return null
  try {
    return sessionIntakeLimits({ maxPendingInputs, maxInputBytes })
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}

function runCommandFacts(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
  basis: SessionCommitBasis,
  at: string | null,
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
  const intakeLimits = intakeLimitsOf(facts['intakeLimits'])
  if (intakeLimits === null)
    return { kind: 'unsupported', basis: { reason: 'invalid intake limits' } }
  const permissionChange =
    basis.kind === 'permission-change' &&
    basis.permissionChange.operation === command.input.operation
      ? { ...basis.permissionChange, operation: command.input.operation }
      : undefined
  const reply = runCommand({ command, guards, evidence, at }, port, intakeLimits, permissionChange)
  return reply.kind === 'participated'
    ? {
        kind: 'participated',
        response: { ...(reply.response as object), digest: commandDigest(command) },
      }
    : reply
}

function runQueryFacts(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
): ParticipantReply {
  const { tenant, session, operation } = facts as Record<string, unknown>
  return typeof tenant === 'string' && typeof session === 'string' && typeof operation === 'string'
    ? runQuery(port, tenant, session, operation)
    : { kind: 'unsupported', basis: { reason: 'query facts are incomplete' } }
}

function executeSession(
  facts: Readonly<Record<string, JsonValue>>,
  port: ParticipantPort,
  basis: SessionCommitBasis,
): ParticipantReply {
  const at = facts['at'] ?? null
  if (at !== null && typeof at !== 'string')
    return { kind: 'unsupported', basis: { reason: 'the commit time is not a text' } }
  switch (facts['intent']) {
    case 'query':
      return runQueryFacts(facts, port)
    case 'entries':
      return runEntries(facts, port, at)
    case 'log':
      return runLog(facts, port, at)
    case 'check':
      return runChecks(facts, port)
    case 'command':
      return runCommandFacts(facts, port, basis, at)
    default:
      return {
        kind: 'unsupported',
        basis: {
          reason: 'the facts are neither a command, a check, a same-log commit nor a query',
        },
      }
  }
}

const participant: ParticipantModule = {
  participant: 'session',
  protocol: SESSION_COMMIT_PROTOCOL,
  execute(facts, port) {
    const basis = readSessionBasis(facts, port)
    if (basis === null)
      return { kind: 'unsupported', basis: { reason: 'Session commit basis mismatch' } }
    let reply: ParticipantReply
    try {
      reply = executeSession(facts, port, basis)
    } catch (error) {
      if (error instanceof LogGap) return { kind: 'failed', diagnostic: error.message }
      throw error
    }
    return reply
  },
}

export default refusingMalformedEntries(participant)
