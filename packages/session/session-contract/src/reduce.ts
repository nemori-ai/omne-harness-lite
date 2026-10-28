// The pure batch reduction (SPEC SL12, SL13, SL18; docs/object-model「纯批次归约算法」). It
// interprets committed entries only, in batch order, and publishes no partial state: an unknown
// kind, a missing origin or a contradiction quarantines the session.
import type { Adoption, DurableEvidence, InputId } from './identity.ts'
import type { RecoveryTask, WorkSnapshot } from './values.ts'
import { SESSION_INTERPRETER, decodeEntry, type SessionEntry } from './entries.ts'
import type { CommittedBatch, ReduceResult } from './judgments.ts'
import { applyExtended } from './reduce-extended.ts'
import { scopeBinding } from './decide-management.ts'
import { digestOf } from './operations.ts'
import { applyParticipation } from './result-state.ts'

/** The evidence of one committed batch: the session, its revision and the digest of the entry ids. */
export function batchEvidence(batch: CommittedBatch, session: string): DurableEvidence {
  return {
    owner: '@omne-harness/session-contract',
    record: `${session}@${batch.revision}`,
    revision: batch.revision,
    digest: `sha256:${digestOf(batch.entries.map(entry => entry.id))}`,
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
      if (Number(entry.ordinal) !== Number(draft.run.ordinal) + 1)
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
      adopted: entry.creation.definition.candidate,
    },
    execution: entry.creation.execution,
    declarations: origin,
    revisions: { workspace: '0', declarations: '0' },
    run: { kind: 'none' },
    pending: [],
    handed: [],
    waiting: [],
    consumptions: [],
    controls: [],
    unresolved: [],
    creation: entry.creation,
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
export function reduce(previous: WorkSnapshot | null, batch: CommittedBatch): ReduceResult {
  if (previous !== null && batch.revision === previous.revision)
    return { kind: 'reduced', snapshot: previous }
  if (previous !== null && Number(batch.revision) !== Number(previous.revision) + 1)
    return quarantined(`batch ${batch.revision} does not follow revision ${previous.revision}`)
  if (batch.entries.length === 0) return quarantined(`batch ${batch.revision} has no entries`)
  if (batch.entries.some(entry => entry.revision !== batch.revision))
    return quarantined(`batch ${batch.revision} holds an entry of another revision`)
  let draft: Draft | null = previous === null ? null : { ...previous }
  for (const [index, row] of batch.entries.entries()) {
    const decoded = decodeEntry(row)
    if ('unknown' in decoded) return quarantined(`unknown entry kind ${decoded.unknown}`)
    if ('malformed' in decoded) return quarantined(decoded.malformed)
    const entry = decoded.ok
    if (draft === null) {
      if (entry.kind !== 'session.created' || index !== 0)
        return quarantined('the first batch does not begin with session.created')
      draft = created(entry, batch, row.origin.source, SESSION_INTERPRETER)
      continue
    }
    const diagnostic = apply(draft, entry, row.origin.source)
    if (diagnostic !== null) return quarantined(`${row.kind} at ${row.id}: ${diagnostic}`)
  }
  if (draft === null) return quarantined('the batch created nothing')
  draft.revision = batch.revision
  draft.source = batchEvidence(batch, draft.session)
  draft.lifecycle = lifecycleOf(draft)
  return { kind: 'reduced', snapshot: draft }
}
