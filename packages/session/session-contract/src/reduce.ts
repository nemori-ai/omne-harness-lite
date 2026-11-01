import { projectWorkEntries, requiredWorkEntries, unsettled } from './work-entry-state.ts'
import type { SessionHistoryReads } from './history-values.ts'
import { validateReplayHistory, validateInterpretationEntry } from './frontier-state.ts'
import {
  SessionValidationFailure,
  decimal,
  nonempty,
  unique,
  invalidAt,
} from './session-validation.ts'
import { CallConflict } from './call-state.ts'
// The pure batch reduction (SPEC SL12, SL13, SL18; docs/object-model「纯批次归约算法」). It
// interprets committed entries only, in batch order, and publishes no partial state: an unknown
// kind, a missing origin or a contradiction quarantines the session.
import type { Adoption, DurableEvidence, InputId } from './identity.ts'
import type { RecoveryTask, WorkSnapshot } from './values.ts'
import { SESSION_INTERPRETER, decodeEntry, type SessionEntry } from './entries.ts'
import type { CommittedBatch, ReduceResult } from './judgments.ts'
import { advanceEntriesProgress, applyExtended } from './reduce-extended.ts'
import type { SessionEntriesProgress } from './interpretation-values.ts'
import { scopeBinding } from './decide-management.ts'
import { digestOf } from './operations.ts'
import { applyParticipation } from './result-state.ts'
import { initializationProjection, validateInitializationBatch } from './reduce-initialization.ts'
import { sameInitializationValue } from './initialization-plan.ts'
import { adoption, InitializationInvalid } from './initialization-parse.ts'

/** The evidence of one committed batch: the session, its revision and the digest of the complete entries, including their exact interpretation adoption. */
export function batchEvidence(batch: CommittedBatch, session: string): DurableEvidence {
  return {
    owner: '@omne-harness/session-contract',
    record: `${session}@${batch.revision}`,
    revision: batch.revision,
    digest: `sha256:${digestOf(batch.entries)}`,
  }
}

type Draft = {
  -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K]
}

function quarantined(diagnostic: string): ReduceResult {
  return { kind: 'quarantined', diagnostic }
}

function lifecycleOf(draft: Draft): WorkSnapshot['lifecycle'] {
  if (draft.lifecycle === 'archived') return 'archived'
  if (draft.tasks.some(task => task.kind === 'initialization')) return 'initializing'
  if (draft.run.kind === 'active') return 'active'
  if (draft.frozen !== null) return 'frozen'
  return 'dormant'
}

function without(list: readonly InputId[], removed: readonly InputId[]): readonly InputId[] {
  const gone = new Set(removed)
  return list.filter(input => !gone.has(input))
}

/** Applies one decoded entry. Returns a diagnostic when the entry contradicts the state. */
function apply(draft: Draft, entry: SessionEntry, source: DurableEvidence): string | null {
  switch (entry.kind) {
    case 'session.created':
      return 'session.created after the first entry'
    case 'session.initialization-item': {
      const { item, owner, result } = entry.result
      const index = draft.tasks.findIndex(
        task => task.kind === 'initialization' && task.item === item && task.owner === owner,
      )
      if (index === -1) return `initialization item ${owner}/${item} is not pending`
      const task = draft.tasks[index] as Extract<RecoveryTask, { kind: 'initialization' }>
      const rest = draft.tasks.filter((_, at) => at !== index)
      draft.tasks =
        result.kind === 'ready'
          ? rest
          : [...rest, { ...task, state: 'failed', diagnostic: result.diagnostic }]
      return null
    }
    case 'session.adoption':
      draft.definition = { name: draft.definition.name, adopted: entry.adopted }
      if (draft.run.kind === 'active') draft.run = { ...draft.run, adoption: entry.adopted }
      if (entry.residentKeys !== undefined) draft.residentKeys = entry.residentKeys
      return null
    case 'message.user':
    case 'message.assistant':
    case 'message.tool':
    case 'message.tool_internal':
    case 'message.system_reminder':
    case 'message.compaction': {
      return entry.participation === null ? null : applyParticipation(draft, entry.participation)
    }
    case 'intake.routed':
      if ('task' in entry) {
        draft.tasks = [...draft.tasks, entry.task]
        return null
      }
      if (draft.pending.includes(entry.input)) return `input ${entry.input} accepted twice`
      draft.pending = [...draft.pending, entry.input]
      draft.idle = null
      return null
    case 'intake.handed-over': {
      if (!draft.pending.includes(entry.input)) return `hand-over of an input that is not pending`
      if (entry.result.kind === 'accepted') {
        if (!draft.handed.includes(entry.input)) draft.handed = [...draft.handed, entry.input]
      } else {
        draft.pending = without(draft.pending, [entry.input])
        draft.handed = without(draft.handed, [entry.input])
      }
      return null
    }
    case 'run.started': {
      if (draft.tasks.some(task => task.kind === 'initialization'))
        return 'a Run started before every initialization item was ready'
      if (draft.run.kind === 'active') return 'a second Run started while one is unfinished'
      if (!draft.pending.includes(entry.first)) return 'the first input of the Run is not pending'
      draft.run = {
        kind: 'active',
        run: entry.run,
        adoption: entry.adoption,
        first: entry.first,
        advance: null,
        ordinal: '0',
        execution: { execution: entry.execution, revision: null, evidence: null, readThrough: '0' },
      }
      draft.executions = [
        ...(draft.executions ?? []),
        { run: entry.run, execution: draft.run.execution, terminal: null },
      ]
      draft.idle = null
      return null
    }
    case 'run.attempt-started': {
      if (draft.run.kind !== 'active' || draft.run.run !== entry.run)
        return 'an attempt started outside the active Run'
      if (draft.run.advance !== null) return 'an attempt started while one holds the advance'
      if (
        decimal(entry.ordinal, 'attempt.ordinal') !==
        decimal(draft.run.ordinal, 'attempt.ordinal') + 1n
      )
        return `attempt ordinal ${entry.ordinal} does not follow ${draft.run.ordinal}`
      draft.run = {
        ...draft.run,
        ordinal: entry.ordinal,
        advance: { run: entry.run, attempt: entry.attempt, instance: entry.instance },
      }
      return null
    }
    case 'run.attempt-released': {
      if (draft.run.kind !== 'active' || draft.run.run !== entry.run)
        return 'an attempt released outside the active Run'
      if (draft.run.advance === null || draft.run.advance.attempt !== entry.attempt)
        return 'the released attempt does not hold the advance'
      draft.run = { ...draft.run, advance: null }
      return null
    }
    case 'run.terminal': {
      if (draft.run.kind !== 'active' || draft.run.run !== entry.terminal.run)
        return 'a terminal outside the active Run'
      if (draft.run.advance !== null) return 'a terminal while an attempt still holds the advance'
      // The hand-over state belongs to the execution of the Run: a successor Run re-hands every
      // input that kept its eligibility (PA-08 item 2), so the terminal releases `handed`.
      draft.executions = (draft.executions ?? []).map(item =>
        item.run === entry.terminal.run ? { ...item, terminal: entry.terminal } : item,
      )
      draft.run = { kind: 'terminal', terminal: entry.terminal }
      draft.handed = []
      draft.taken = []
      draft.waiting = []
      draft.callWaits = []
      return null
    }
    default:
      return applyExtended(draft, entry, source)
  }
}

function created(
  entry: Extract<SessionEntry, { kind: 'session.created' }>,
  batch: CommittedBatch,
  origin: DurableEvidence,
  interpreter: Adoption,
): Draft {
  return {
    session: entry.session,
    tenant: entry.tenant,
    revision: batch.revision,
    interpreter,
    source: batchEvidence(batch, entry.session),
    lifecycle: 'dormant',
    frozen: null,
    residents: [],
    definition: {
      name: entry.creation.definition.name,
      adopted: entry.initialAdoption.adopted,
    },
    execution: entry.creation.execution,
    declarations: origin,
    revisions: { workspace: '0', declarations: '0' },
    run: { kind: 'none' },
    pending: [],
    handed: [],
    waiting: [],
    consumptions: [],
    callRegistrations: [],
    callWaits: [],
    workEntryIndex: { calls: [], controls: [] },
    controls: [],
    unresolved: [],
    creation: entry.creation,
    initialization: {
      protocol: 1,
      createOperation: entry.operation,
      initialAdoption: entry.initialAdoption,
      input: entry.input,
      requirements: entry.requirements,
      plan: entry.plan,
      results: [],
      registrations: [],
    },
    tasks: entry.items.map(item => ({
      kind: 'initialization',
      ...item,
      originalOperation: entry.operation,
      state: 'pending',
      diagnostic: null,
    })),
    idle: null,
    executions: [],
    residentKeys: [],
    autoArchive: { kind: 'disabled' },
    contextScopes: [
      scopeBinding({ tenant: entry.tenant, session: entry.session }, entry.operation),
    ],
  }
}

/**
 * The snapshot after one committed batch. `previous` is null before the first batch, whose first
 * entry must be the creation. The same batch applied again recalls the saved state (SL12). A
 * batch that does not follow the previous revision, an unknown kind or a contradiction gives
 * `quarantined` and no partial state.
 */
function reduceBatch(
  previous: WorkSnapshot | null,
  batch: CommittedBatch,
  reads?: SessionHistoryReads,
): ReduceResult {
  if (batch.entries.length === 0) return quarantined(`batch ${batch.revision} has no entries`)
  try {
    for (const row of batch.entries) adoption(row.schema)
    if (previous !== null) adoption(previous.interpreter)
  } catch (error) {
    if (error instanceof InitializationInvalid)
      return quarantined('missing interpretation basis: absent or malformed version metadata')
    throw error
  }
  const firstSchema = batch.entries[0]?.schema
  if (batch.entries.some(row => !sameInitializationValue(row.schema, firstSchema)))
    return quarantined('missing interpretation basis: conflicting batch interpreter adoptions')
  const unsupported = batch.entries.find(
    entry => !sameInitializationValue(entry.schema, SESSION_INTERPRETER),
  )
  if (unsupported !== undefined)
    return quarantined(`unsupported interpreter adoption: ${JSON.stringify(unsupported.schema)}`)
  if (previous !== null && !sameInitializationValue(previous.interpreter, SESSION_INTERPRETER))
    return quarantined(
      `unsupported snapshot interpreter adoption: ${JSON.stringify(previous.interpreter)}`,
    )
  if (previous !== null && batch.revision === previous.revision)
    return sameInitializationValue(previous.source, batchEvidence(batch, previous.session))
      ? { kind: 'reduced', snapshot: previous }
      : quarantined('the repeated batch contradicts the committed snapshot')
  if (
    previous !== null &&
    decimal(batch.revision, 'batch.revision') !==
      decimal(previous.revision, 'snapshot.revision') + 1n
  )
    return quarantined(`batch ${batch.revision} does not follow revision ${previous.revision}`)
  unique(batch.entries, entry => entry.id, 'batch.entries.id')
  const priorReferences =
    previous?.workEntryIndex === undefined
      ? []
      : [
          ...previous.workEntryIndex.calls.flatMap(call => [
            call.registered,
            ...(call.association === null ? [] : [call.association]),
            ...call.waits.map(wait => wait.entry),
          ]),
          ...previous.workEntryIndex.controls.flatMap(control => [
            control.intent,
            ...(control.progress === null ? [] : [control.progress]),
            ...control.selected.flatMap(item => [
              item.registered,
              item.waiting,
              ...(item.association === null ? [] : [item.association]),
            ]),
          ]),
        ]
  for (const row of batch.entries) {
    nonempty(row.id, 'entry.id')
    if (priorReferences.includes(row.id))
      invalidAt('entry.id', 'reused an original Session entry identity')
  }
  if (batch.entries.some(entry => entry.revision !== batch.revision))
    return quarantined(`batch ${batch.revision} holds an entry of another revision`)
  let draft: Draft | null = previous === null ? null : { ...previous }
  const decodedEntries: SessionEntry[] = []
  for (const row of batch.entries) {
    const decoded = decodeEntry(row)
    if ('unknown' in decoded) return quarantined(`unknown entry kind ${decoded.unknown}`)
    if ('malformed' in decoded) return quarantined(decoded.malformed)
    decodedEntries.push(decoded.ok)
  }
  const interpretationRuns =
    previous === null
      ? undefined
      : validateReplayHistory(previous, decodedEntries, batch.entries, reads)
  const initializationDiagnostic = validateInitializationBatch(previous, batch, decodedEntries)
  if (initializationDiagnostic !== null) return quarantined(initializationDiagnostic)
  for (const [index, row] of batch.entries.entries()) {
    const entry = decodedEntries[index]
    if (entry === undefined) return quarantined('missing decoded entry')
    if (draft === null) {
      if (entry.kind !== 'session.created' || index !== 0)
        return quarantined('the first batch does not begin with session.created')
      draft = created(entry, batch, row.origin.source, SESSION_INTERPRETER)
      continue
    }
    const source =
      entry.kind === 'call.bound'
        ? {
            owner: '@omne-harness/session-contract',
            record: row.id,
            revision: row.revision,
            digest: `sha256:${digestOf(row)}`,
          }
        : row.origin.source
    const before = { ...draft }
    validateInterpretationEntry(draft, entry, interpretationRuns?.get(row.id))
    const diagnostic = apply(draft, entry, source)
    if (diagnostic !== null) return quarantined(`${row.kind} at ${row.id}: ${diagnostic}`)
    const workEntryIndex = projectWorkEntries(before, draft, entry, row)
    if (workEntryIndex !== undefined) draft.workEntryIndex = workEntryIndex
    requiredWorkEntries(draft)
    const initialization = initializationProjection(draft, entry, row, batch)
    if (initialization !== undefined) draft.initialization = initialization
  }
  if (draft === null) return quarantined('the batch created nothing')
  if (draft.workEntryIndex !== undefined)
    draft.workEntryIndex = {
      ...draft.workEntryIndex,
      controls: draft.workEntryIndex.controls.filter(item =>
        draft.controls.some(control => control.operation === item.operation && unsettled(control)),
      ),
    }
  draft.revision = batch.revision
  draft.source = batchEvidence(batch, draft.session)
  draft.lifecycle = lifecycleOf(draft)
  return { kind: 'reduced', snapshot: draft }
}

export function reduce(
  previous: WorkSnapshot | null,
  batch: CommittedBatch,
  reads?: SessionHistoryReads,
): ReduceResult {
  try {
    return reduceBatch(previous, batch, reads)
  } catch (error) {
    if (
      error instanceof SessionValidationFailure ||
      error instanceof CallConflict ||
      error instanceof TypeError ||
      error instanceof RangeError
    )
      return quarantined(`malformed or inconsistent Session batch: ${error.message}`)
    throw error
  }
}

/**
 * `reduce`, carrying the saved entries progress of the session across batches. The progress rows
 * of the batch advance it (RD-1), and the item of each channel takes the evidence of the batch
 * that set it: the `source` of the reduced snapshot. The repeated batch recalls and keeps the
 * progress. The progress is an input and an output until `WorkSnapshot` can hold it.
 */
export function reduceWithEntriesProgress(
  previous: WorkSnapshot | null,
  saved: readonly SessionEntriesProgress[],
  batch: CommittedBatch,
  reads?: SessionHistoryReads,
):
  | Readonly<{
      kind: 'reduced'
      snapshot: WorkSnapshot
      progress: readonly SessionEntriesProgress[]
    }>
  | Extract<ReduceResult, { kind: 'quarantined' }> {
  const reduced = reduce(previous, batch, reads)
  if (reduced.kind === 'quarantined') return reduced
  if (previous !== null && batch.revision === previous.revision)
    return { kind: 'reduced', snapshot: reduced.snapshot, progress: saved }
  const rows = batch.entries.flatMap(row => {
    const decoded = decodeEntry(row)
    return 'ok' in decoded && decoded.ok.kind === 'entries.interpreted' ? [decoded.ok] : []
  })
  const progress = advanceEntriesProgress(saved, rows, reduced.snapshot.source)
  return typeof progress === 'string'
    ? { kind: 'quarantined', diagnostic: progress }
    : { kind: 'reduced', snapshot: reduced.snapshot, progress }
}
