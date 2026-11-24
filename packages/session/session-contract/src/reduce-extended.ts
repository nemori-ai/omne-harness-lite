import { applyPermissionEvent } from './permission-state.ts'
import { reduceAuthorizations } from './authorizations.ts'
import type { SessionEntry } from './entries.ts'
import type { RecoveryTask, WorkSnapshot } from './values.ts'
import type { DurableEvidence } from './identity.ts'
import type { SessionEntriesProgress } from './interpretation-values.ts'
import { applyResult, applyProducerFact } from './reduce-results.ts'
import { requestControl, validateControlProgress } from './control-state.ts'
import {
  decimal,
  annotationTargets,
  evidenceFields,
  equalValue,
  invalidAt,
  unavailableAt,
} from './session-validation.ts'
import { associated, registerCall, registeredWaiting } from './call-state.ts'
import {
  applyBackgroundSettled,
  applyBackgroundStop,
  applyBackgrounded,
} from './background-outcome.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }

function takeBatch(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'run.batch-taken' }>,
): string | null {
  const ordered = entry.batch.ordered
  if (new Set(ordered).size !== ordered.length) return 'a taken batch repeats an input'
  draft.pending = draft.pending.filter(input => !ordered.includes(input))
  if (draft.run.kind !== 'active' || draft.run.run !== entry.run) return null
  if (ordered.some(input => (draft.taken ?? []).includes(input)))
    return 'an input taken twice in the same Run'
  draft.handed = draft.handed.filter(input => !ordered.includes(input))
  draft.taken = [...(draft.taken ?? []), ...ordered]
  draft.unanswered = [...(draft.unanswered ?? []), ...ordered]
  return null
}

function applyResidentAdmitted(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.tool-resident-admitted' }>,
): string | null {
  if (draft.residents.some(item => item.capability === entry.resident.capability))
    return 'resident admitted twice'
  draft.residents = [...draft.residents, entry.resident]
  return null
}

function applySegmentAdmitted(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.prompt-segment-admitted' }>,
): string | null {
  const { segment } = entry
  const segments = draft.segments ?? []
  const prior = segments.find(item => item.key === segment.key)
  if (prior !== undefined && !segment.text.startsWith(prior.text))
    return 'resident segment revision does not begin with the previous text'
  draft.segments = [...segments.filter(item => item.key !== segment.key), segment]
  return null
}

function applyDeclaration(
  draft: Draft,
  entry: Extract<
    SessionEntry,
    {
      kind:
        | 'session.mode-changed'
        | 'session.model-selected'
        | 'session.declaration-adopted'
        | 'session.context-registration-changed'
        | 'session.recovery-input-adopted'
    }
  >,
  source: DurableEvidence,
): string | null {
  if ('policy' in entry) {
    draft.autoArchive = entry.policy
    draft.declarations = source
    draft.revisions = {
      ...draft.revisions,
      declarations: String(BigInt(draft.revisions.declarations) + 1n),
    }
    return null
  }
  if (entry.kind === 'session.declaration-adopted') {
    draft.declarations = source
    draft.revisions = {
      ...draft.revisions,
      declarations: String(BigInt(draft.revisions.declarations) + 1n),
    }
  }
  if (entry.kind === 'session.declaration-adopted' && entry.declaration.kind === 'environment-mode')
    return null
  draft.changes = [...(draft.changes ?? []), entry.declaration]
  if (
    entry.scope !== null &&
    (entry.declaration.kind === 'context-registration' ||
      entry.declaration.kind === 'context-step-commit')
  )
    draft.contextRecords = [
      ...(draft.contextRecords ?? []),
      { scope: entry.scope, declaration: entry.declaration },
    ]
  return null
}

function applyWorkspaceChanged(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.workspace-changed' }>,
): string | null {
  draft.changes = [
    ...(draft.changes ?? []),
    {
      kind: 'workspace',
      value: entry.workspace,
      workspaceAttachment: entry.workspaceAttachment,
      basis: entry.basis,
    },
  ]
  draft.revisions = {
    ...draft.revisions,
    workspace: String(BigInt(draft.revisions.workspace) + 1n),
  }
  return null
}

function applyChildRecorded(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.child-recorded' }>,
): string | null {
  const children = draft.children ?? []
  if (!children.includes(entry.child)) draft.children = [...children, entry.child]
  return null
}

function applyIdleEvidence(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.idle-evidence' }>,
  source: DurableEvidence,
): string | null {
  draft.idle =
    entry.observation === null ? null : { observation: entry.observation, commit: source }
  return null
}

function applyFrozen(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.frozen' }>,
  source: DurableEvidence,
): string | null {
  if (draft.tasks.some(task => task.kind === 'initialization'))
    return 'session frozen before every initialization item was ready'
  if (draft.frozen !== null) return 'a second freeze'
  draft.frozen = { cause: 'tool-shape-lost', evidence: entry.evidence, commit: source }
  return null
}

function applyInputsReleased(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'intake.released' }>,
): string | null {
  draft.pending = draft.pending.filter(input => !entry.inputs.includes(input))
  draft.handed = draft.handed.filter(input => !entry.inputs.includes(input))
  return null
}

function applyHistoryAnnotated(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'history.annotated' }>,
): string | null {
  if ('targets' in entry) {
    annotationTargets(entry.targets)
    evidenceFields(entry.source, 'history.source')
    return null
  }
  if (!('execution' in entry)) return null
  const old = draft.executions?.find(item => item.run === entry.run)
  if (old === undefined || old.execution.execution !== entry.execution.execution)
    return 'missing historical execution binding'
  evidenceFields(entry.execution.evidence, 'execution.evidence')
  const revision = decimal(entry.execution.revision, 'execution.revision')
  if (
    old.execution.revision !== null &&
    revision < decimal(old.execution.revision, 'execution.revision')
  )
    return 'execution head moved backwards'
  if (
    old.execution.revision === entry.execution.revision &&
    old.execution.evidence !== null &&
    !equalValue(old.execution.evidence, entry.execution.evidence)
  )
    return 'execution head receipt changed'
  if (
    decimal(entry.execution.readThrough, 'execution.readThrough') <
    BigInt(old.execution.readThrough)
  )
    return 'execution read progress moved backwards'
  draft.executions = (draft.executions ?? []).map(item =>
    item.run === entry.run ? { ...item, execution: entry.execution } : item,
  )
  if (draft.run.kind === 'active' && draft.run.run === entry.run)
    draft.run = { ...draft.run, execution: entry.execution }
  return null
}

function applyEntriesInterpreted(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'entries.interpreted' }>,
): string | null {
  if (decimal(entry.through, 'entries.through') <= decimal(entry.after, 'entries.after'))
    return 'entries progress does not advance'
  if (
    !(draft.executions ?? []).some(
      item => item.run === entry.run && item.execution.execution === entry.execution,
    )
  )
    return 'missing historical execution binding'
  return null
}

function applyCallBound(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'call.bound' }>,
  source: DurableEvidence,
): string | null {
  if ('binding' in entry && entry.reference !== entry.binding.producer.call)
    invalidAt('reference', 'does not match original binding')
  registerCall(
    draft,
    entry.consumption,
    'registration' in entry ? entry.registration : associated(entry.binding, entry.purpose),
    source,
    'association' in entry ? entry.association : null,
  )
  return null
}

function applyExtensionPassage(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'extension.passage' }>,
): string | null {
  if ('calls' in entry) registeredWaiting(draft, entry.run, entry.calls, entry.other)
  else {
    const calls = entry.waiting.flatMap(wait => {
      if (wait.kind !== 'producer') return []
      const record = draft.callRegistrations?.find(
        item =>
          item.registration.kind === 'associated' &&
          equalValue(item.registration.binding, wait.binding),
      )
      if (record === undefined) unavailableAt('waiting.registration')
      return [{ consumption: record.consumption, position: wait.position }]
    })
    registeredWaiting(
      draft,
      entry.run,
      calls,
      entry.waiting.filter(item => item.kind !== 'producer'),
    )
  }
  return null
}

function applyControlRequested(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'control.requested' }>,
): string | null {
  requestControl(draft, entry.progress)
  applyBackgroundStop(draft, entry.progress)
  return null
}

function applyControlProgress(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'control.progress' }>,
): string | null {
  if (entry.progress !== null) {
    const progress = entry.progress
    validateControlProgress(draft, progress)
    draft.controls = draft.controls.map(item =>
      item.operation === progress.operation ? progress : item,
    )
  }
  const fact = entry.fact
  if (fact === null) return null
  if (fact.kind === 'cascade') {
    const answered = (task: RecoveryTask): task is Extract<RecoveryTask, { kind: 'cascade' }> =>
      task.kind === 'cascade' &&
      task.child === fact.child &&
      task.childOperation === fact.childOperation
    draft.tasks =
      fact.refusal === undefined
        ? draft.tasks.filter(task => !answered(task))
        : draft.tasks.map(task => (answered(task) ? { ...task, state: 'denied' } : task))
  }
  if (fact.kind === 'routed-input')
    draft.tasks = draft.tasks.filter(
      task => task.kind !== 'routed-input' || task.originalOperation !== fact.originalOperation,
    )
  if (fact.kind === 'scope-release') {
    const released =
      fact.dispositions.length > 0 && fact.dispositions.every(item => item === 'released')
    draft.tasks = draft.tasks.flatMap(task =>
      task.kind === 'scope-release' && task.archive === fact.archive && task.scope === fact.scope
        ? released
          ? []
          : [{ ...task, last: fact.dispositions }]
        : [task],
    )
    if (released)
      draft.releasedScopes = [
        ...(draft.releasedScopes ?? []),
        { task: fact.archive, scope: fact.scope },
      ]
  }
  return null
}

function applyArchived(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.archived' }>,
): string | null {
  draft.lifecycle = 'archived'
  draft.pending = []
  draft.handed = []
  draft.waiting = []
  draft.callWaits = []
  draft.taken = []
  delete draft.unanswered
  delete draft.awaitingPerson
  draft.tasks = [...draft.tasks.filter(task => task.kind !== 'routed-input'), ...entry.tasks]
  const existing = draft.contextScopes ?? []
  draft.contextScopes = [
    ...existing.filter(scope => scope.scope !== entry.scope.scope),
    entry.scope,
  ]
  return null
}

function applyUnarchived(
  draft: Draft,
  entry: Extract<SessionEntry, { kind: 'session.unarchived' }>,
): string | null {
  draft.lifecycle = 'dormant'
  draft.contextScopes = [...(draft.contextScopes ?? []), entry.scope]
  return null
}

export function applyExtended(
  draft: Draft,
  entry: SessionEntry,
  source: DurableEvidence,
): string | null {
  draft.permissions = applyPermissionEvent(draft.permissions, entry, source)
  switch (entry.kind) {
    case 'session.permission-assigned':
      return null
    case 'session.authorization-expressed':
      draft.authorizations = reduceAuthorizations(draft.authorizations, entry.expression)
      return null
    case 'session.tool-resident-admitted':
      return applyResidentAdmitted(draft, entry)
    case 'session.prompt-segment-admitted':
      return applySegmentAdmitted(draft, entry)
    case 'session.mode-changed':
    case 'session.model-selected':
    case 'session.declaration-adopted':
    case 'session.context-registration-changed':
    case 'session.recovery-input-adopted':
      return applyDeclaration(draft, entry, source)
    case 'session.workspace-changed':
      return applyWorkspaceChanged(draft, entry)
    case 'session.resident':
      draft.resident = entry.resident
      return null
    case 'session.command-recorded':
      return null
    case 'session.child-recorded':
      return applyChildRecorded(draft, entry)
    case 'session.idle-evidence':
      return applyIdleEvidence(draft, entry, source)
    case 'session.frozen':
      return applyFrozen(draft, entry, source)
    case 'intake.released':
      return applyInputsReleased(draft, entry)
    case 'hitl.decision':
    case 'run.attempt-exited':
      return null
    case 'history.annotated':
      return applyHistoryAnnotated(draft, entry)
    case 'entries.interpreted':
      return applyEntriesInterpreted(draft, entry)
    case 'run.batch-taken':
      return takeBatch(draft, entry)
    case 'call.bound':
      return applyCallBound(draft, entry, source)
    case 'call.result-preserved':
    case 'call.result-processed':
      return applyResult(draft, entry)
    case 'call.execution-fact':
    case 'account.linked':
      return applyProducerFact(draft, entry)
    case 'call.backgrounded':
      return applyBackgrounded(draft, entry)
    case 'call.background-settled':
      return applyBackgroundSettled(draft, entry)
    case 'extension.passage':
      return applyExtensionPassage(draft, entry)
    case 'control.requested':
      return applyControlRequested(draft, entry)
    case 'control.progress':
      return applyControlProgress(draft, entry)
    case 'session.archived':
      return applyArchived(draft, entry)
    case 'session.unarchived':
      return applyUnarchived(draft, entry)
    default:
      return `unsupported entry ${entry.kind}`
  }
}

type ProgressRow = Extract<SessionEntry, { kind: 'entries.interpreted' }>

export function advanceEntriesProgress(
  saved: readonly SessionEntriesProgress[],
  rows: readonly ProgressRow[],
  evidence: DurableEvidence,
): readonly SessionEntriesProgress[] | string {
  let progress = saved
  for (const row of rows) {
    const sameChannel = (item: SessionEntriesProgress) =>
      item.run === row.run && item.execution === row.execution && item.channel === row.channel
    const through = progress.find(sameChannel)?.through ?? '0'
    if (row.after !== through)
      return `entries progress of ${row.run}/${row.execution}/${row.channel} starts after ${row.after}, saved through ${through}`
    const next: SessionEntriesProgress = {
      run: row.run,
      execution: row.execution,
      channel: row.channel,
      through: row.through,
      position: row.position,
      interpreted: evidence,
    }
    progress = progress.some(sameChannel)
      ? progress.map(item => (sameChannel(item) ? next : item))
      : [...progress, next]
  }
  return progress
}
