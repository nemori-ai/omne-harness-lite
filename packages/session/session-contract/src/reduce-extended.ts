import type { SessionEntry } from './entries.ts'
import type { WorkSnapshot } from './values.ts'
import type { DurableEvidence } from './identity.ts'
import { applyResult, applyProducerFact } from './reduce-results.ts'
import { requestControl, validateControlProgress } from './control-state.ts'
import {
  decimal,
  evidenceFields,
  equalValue,
  invalidAt,
  unavailableAt,
} from './session-validation.ts'
import { associated, registerCall, registeredWaiting } from './call-state.ts'

type Draft = { -readonly [K in keyof WorkSnapshot]: WorkSnapshot[K] }
export function applyExtended(
  draft: Draft,
  entry: SessionEntry,
  source: DurableEvidence,
): string | null {
  switch (entry.kind) {
    case 'session.tool-resident-admitted':
      if (draft.residents.some(item => item.capability === entry.resident.capability))
        return 'resident admitted twice'
      draft.residents = [...draft.residents, entry.resident]
      return null
    case 'session.mode-changed':
    case 'session.model-selected':
    case 'session.declaration-adopted':
    case 'session.context-registration-changed':
    case 'session.recovery-input-adopted':
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
      if (
        entry.kind === 'session.declaration-adopted' &&
        entry.declaration.kind === 'environment-mode'
      )
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
    case 'session.workspace-changed':
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
    case 'session.relation':
    case 'session.resident':
      draft.relation = entry.relation
      return null
    case 'session.idle-evidence':
      draft.idle =
        entry.observation === null ? null : { observation: entry.observation, commit: source }
      return null
    case 'session.frozen':
      if (draft.tasks.some(task => task.kind === 'initialization'))
        return 'session frozen before every initialization item was ready'
      if (draft.frozen !== null) return 'a second freeze'
      draft.frozen = { cause: 'tool-shape-lost', evidence: entry.evidence, commit: source }
      return null
    case 'intake.released':
      draft.pending = draft.pending.filter(input => !entry.inputs.includes(input))
      draft.handed = draft.handed.filter(input => !entry.inputs.includes(input))
      return null
    case 'hitl.decision':
    case 'run.attempt-exited':
      return null
    case 'history.annotated': {
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
    case 'run.batch-taken':
      if (draft.run.kind !== 'active' || draft.run.run !== entry.run) {
        draft.pending = draft.pending.filter(input => !entry.batch.ordered.includes(input))
        return null
      }
      draft.pending = draft.pending.filter(input => !entry.batch.ordered.includes(input))
      draft.handed = draft.handed.filter(input => !entry.batch.ordered.includes(input))
      draft.taken = [...(draft.taken ?? []), ...entry.batch.ordered]
      return null
    case 'call.bound': {
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
    case 'call.result-preserved':
    case 'call.result-processed':
      return applyResult(draft, entry)
    case 'call.execution-fact':
    case 'account.linked':
      return applyProducerFact(draft, entry)
    case 'extension.passage':
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
    case 'control.requested':
      requestControl(draft, entry.progress)
      return null
    case 'control.progress': {
      if (entry.progress !== null) {
        const progress = entry.progress
        validateControlProgress(draft, progress)
        draft.controls = draft.controls.map(item =>
          item.operation === progress.operation ? progress : item,
        )
      }
      const fact = entry.fact
      if (fact === null) return null
      if (fact.kind === 'cascade')
        draft.tasks = draft.tasks.filter(
          task =>
            task.kind !== 'cascade' ||
            task.child !== fact.child ||
            task.childOperation !== fact.childOperation,
        )
      if (fact.kind === 'routed-input')
        draft.tasks = draft.tasks.filter(
          task => task.kind !== 'routed-input' || task.originalOperation !== fact.originalOperation,
        )
      if (fact.kind === 'scope-release') {
        const released =
          fact.dispositions.length > 0 && fact.dispositions.every(item => item === 'released')
        draft.tasks = draft.tasks.flatMap(task =>
          task.kind === 'scope-release' &&
          task.archive === fact.archive &&
          task.scope === fact.scope
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
    case 'session.archived': {
      draft.lifecycle = 'archived'
      draft.pending = []
      draft.handed = []
      draft.waiting = []
      draft.callWaits = []
      draft.taken = []
      draft.tasks = [...draft.tasks.filter(task => task.kind !== 'routed-input'), ...entry.tasks]
      const existing = draft.contextScopes ?? []
      draft.contextScopes = [
        ...existing.filter(scope => scope.scope !== entry.scope.scope),
        entry.scope,
      ]
      return null
    }
    case 'session.unarchived':
      draft.lifecycle = 'dormant'
      draft.contextScopes = [...(draft.contextScopes ?? []), entry.scope]
      return null
    default:
      return `unsupported entry ${entry.kind}`
  }
}
