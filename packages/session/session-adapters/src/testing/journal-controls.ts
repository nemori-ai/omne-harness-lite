import type {
  ControlRecord,
  ControlStage,
  DurableEvidence,
  ExecutionControl,
  Failure,
  PendingCall,
  StepId,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  resolveToolInvocationRef,
  type ToolInvocationRef,
  type ToolOperationParts,
} from '@omne-harness/tool-contract'
import type { FactBody } from '../journal/index.ts'
import { copy, invalid } from './journal-handoff-checks.ts'

export type ToolControlRecord = Extract<ControlRecord, { toolInvocation: ToolInvocationRef }>
type ModelControlRecord = Extract<ControlRecord, { command: { kind: 'interrupt-model' } }>
type ControlTarget =
  | Pick<ToolControlRecord, 'command' | 'toolInvocation' | 'toolOperation'>
  | Pick<ModelControlRecord, 'command' | 'modelInvocation'>
  | Pick<Exclude<ControlRecord, ToolControlRecord | ModelControlRecord>, 'command'>

// A control names the invocation it targets at acceptance; it never looks its call up later.
export function controlTarget(
  command: ExecutionControl,
  calls: readonly PendingCall[],
  tenant: TenantId,
): Outcome<ControlTarget, Failure> {
  if (command.kind === 'cancel' || command.kind === 'suspend') return succeed({ command })
  if (command.kind === 'interrupt-model') {
    const target = calls.find(pending => {
      if (pending.kind !== 'model') return false
      const parts = resolveModelInvocationRef(pending.reference, tenant)
      return 'ok' in parts && parts.ok.call === command.call
    })
    return target?.kind === 'model'
      ? succeed({ command, modelInvocation: target.reference })
      : fail(invalid('command.call', 'not a call of this execution'))
  }
  let matched: Extract<PendingCall, { association: 'associated' }> | undefined
  let admission: ToolOperationParts['admission'] | undefined
  let ambiguous = false
  for (const pending of calls) {
    if (pending.kind !== 'tool' || pending.association !== 'associated') continue
    const parts = resolveToolInvocationRef(pending.reference, tenant)
    if ('failure' in parts)
      return fail(invalid('command.call', 'invalid-tool-invocation-reference'))
    if (parts.ok.call !== command.call) continue
    if (matched !== undefined && admission !== parts.ok.admission) ambiguous = true
    matched = pending
    admission = parts.ok.admission
  }
  if (ambiguous) return fail(invalid('command.call', 'ambiguous-associated-tool-call'))
  if (matched === undefined) return fail(invalid('command.call', 'no-associated-tool-call'))
  return succeed({ command, toolInvocation: matched.reference, toolOperation: null })
}

export function controlStageOf(
  record: ControlRecord,
  stage: ControlStage,
  state: 'reached' | 'unresolved',
  source: DurableEvidence,
  step: StepId | null = null,
): FactBody {
  return {
    kind: 'control.stage',
    control: record.operation,
    command: copy(record.command),
    modelInvocation: record.modelInvocation === undefined ? null : copy(record.modelInvocation),
    toolInvocation: record.toolInvocation === undefined ? null : copy(record.toolInvocation),
    toolOperation: record.toolOperation === undefined ? null : copy(record.toolOperation),
    stage,
    state,
    source,
    step,
  }
}
