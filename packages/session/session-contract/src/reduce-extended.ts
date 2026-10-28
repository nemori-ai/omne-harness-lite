import type { SessionEntry } from './entries.ts'
import type { WorkSnapshot } from './values.ts'
import type { DurableEvidence } from './identity.ts'
import { digestOf } from './operations.ts'
import { bindingRun } from './result-state.ts'
import { applyResult, applyProducerFact } from './reduce-results.ts'

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
      if (BigInt(entry.execution.readThrough) < BigInt(old.execution.readThrough))
        return 'execution read progress moved backwards'
      draft.executions = (draft.executions ?? []).map(item =>
        item.run === entry.run ? { ...item, execution: entry.execution } : item,
      )
      if (draft.run.kind === 'active' && draft.run.run === entry.run)
        draft.run = { ...draft.run, execution: entry.execution }
      return null
    }
    case 'run.batch-taken':
      if (draft.run.kind !== 'active' || draft.run.run !== entry.run)
        return 'input batch outside active Run'
      if (
        entry.batch.ordered.some(
          input => !draft.pending.includes(input) || !draft.handed.includes(input),
        )
      )
        return 'taken input was not pending and handed'
      draft.pending = draft.pending.filter(input => !entry.batch.ordered.includes(input))
      draft.handed = draft.handed.filter(input => !entry.batch.ordered.includes(input))
      draft.taken = [...(draft.taken ?? []), ...entry.batch.ordered]
      return null
    case 'call.bound': {
      const prior = draft.consumptions.find(item => item.id === entry.consumption)
      if (prior !== undefined)
        return digestOf(prior.binding) === digestOf(entry.binding)
          ? null
          : 'consumption binding changed'
      draft.consumptions = [
        ...draft.consumptions,
        { id: entry.consumption, binding: entry.binding, results: [] },
      ]
      if (
        entry.binding.producer.kind === 'model' &&
        draft.run.kind === 'active' &&
        bindingRun(draft, entry.binding) === draft.run.run
      )
        draft.taken = []
      return null
    }
    case 'call.result-preserved':
    case 'call.result-processed':
      return applyResult(draft, entry)
    case 'call.execution-fact':
    case 'account.linked':
      return applyProducerFact(draft, entry)
    case 'extension.passage':
      if (draft.run.kind === 'active' && draft.run.run === entry.run) draft.waiting = entry.waiting
      return null
    case 'control.requested':
      draft.controls = [...draft.controls, entry.progress]
      return null
    case 'control.progress': {
      if (entry.progress !== null) {
        const progress = entry.progress
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
