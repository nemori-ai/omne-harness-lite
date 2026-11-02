// The Agent side of a control event in Session words (AD-02 控制归一). The rule that decides the
// Session consequences is Session's `decideControlConsequences` (session-contract); this module
// only translates the Agent control records, the call settlements and the urgent inputs of one
// execution into its neutral evidence. The memory double and the production Journal build the
// evidence with the same function, from the records of the same root.
import type {
  AgentEvent,
  ControlRecord,
  ControlStage,
  EffectIntent,
} from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  decideControlConsequences,
  deriveDriveOperation,
  type InputId,
  type SessionControlEvidence,
  type SessionControlRecordEvidence,
  type SessionControlSettlement,
  type SessionControlStage,
  type SessionLogConsequence,
} from '@omne-harness/session-contract'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { resolveToolInvocationRef, resolveToolOperationRef } from '@omne-harness/tool-contract'
import { canonical } from './session-values.ts'
import { HistoryFailure, corrupt, unavailable } from './history-failure.ts'
import { operationText, type MemoryExecution } from './journal.ts'
import type { CommonRoot } from './root.ts'

const STAGES: readonly SessionControlStage[] = [
  'intent-established',
  'qualification-revoked',
  'producer-confirmed',
  'physically-stopped',
  'duty-released',
]

/** The invocation reference of one original effect and the call it resolves to, or null. */
function effectCall(
  execution: MemoryExecution,
  effect: EffectIntent,
): Readonly<{ kind: 'model' | 'tool'; reference: string; call: string }> | null {
  const pending = effect.pending
  if (pending.kind === 'model') {
    const value = resolveModelInvocationRef(pending.reference, execution.tenant)
    return 'ok' in value
      ? { kind: 'model', reference: pending.reference, call: value.ok.call }
      : null
  }
  if (pending.association !== 'associated') return null
  const value = resolveToolInvocationRef(pending.reference, execution.tenant)
  return 'ok' in value ? { kind: 'tool', reference: pending.reference, call: value.ok.call } : null
}

/** The Tool invocation of a Tool control, checked against its call and its Tool operation. */
function toolInvocationOf(execution: MemoryExecution, record: ControlRecord): string | null {
  if (record.toolInvocation === undefined) return null
  const invocation = resolveToolInvocationRef(record.toolInvocation, execution.tenant)
  if ('failure' in invocation) corrupt('original Tool control reference')
  if (record.toolOperation !== undefined && record.toolOperation !== null) {
    const operation = resolveToolOperationRef(record.toolOperation, execution.tenant)
    if (
      'failure' in operation ||
      operation.ok.call !== invocation.ok.call ||
      operation.ok.admission !== invocation.ok.admission
    )
      corrupt('Tool operation does not belong to original invocation')
  }
  return 'call' in record.command && invocation.ok.call === record.command.call
    ? record.toolInvocation
    : null
}

/** The revision of the original control command of `record`, from the operation records. */
function acceptedOf(root: CommonRoot, execution: MemoryExecution, record: ControlRecord): string {
  const tenant = tenantCodec.encode(execution.tenant)
  if (!tenant.ok) corrupt('tenant')
  const original = root.agent.operations.get(
    operationText(tenant.value, execution.id, record.operation),
  )
  if (original?.kind !== 'committed') unavailable('original control command')
  return String(original.receipt.revision)
}

type Commanded = ControlRecord & { command: { kind: SessionControlRecordEvidence['command'] } }

/** The invocation references of the execution's original effects that resolve to `call`. */
function referencesOf(
  execution: MemoryExecution,
  family: 'model' | 'tool',
  call: string,
  invocation: string | null,
): string[] {
  const effects = execution.effects.flatMap(effect => {
    const found = effectCall(execution, effect)
    return found !== null && found.kind === family && found.call === call ? [found.reference] : []
  })
  return [...new Set([...(invocation === null ? [] : [invocation]), ...effects])]
}

function recordEvidence(
  root: CommonRoot,
  execution: MemoryExecution,
  record: Commanded,
): SessionControlRecordEvidence {
  const invocation = toolInvocationOf(execution, record)
  const command = record.command.kind
  const family = command === 'interrupt-model' ? 'model' : 'tool'
  return {
    operation: String(record.operation),
    command,
    references:
      'call' in record.command
        ? referencesOf(execution, family, record.command.call, invocation)
        : [],
    invocation,
    reached: STAGES.filter(stage => record.stages[stage as ControlStage]?.state === 'reached'),
    accepted: acceptedOf(root, execution, record),
  }
}

/** The settlements of the execution's calls that its commits up to `through` recorded. */
function settledOf(
  root: CommonRoot,
  execution: MemoryExecution,
  through: number,
): SessionControlSettlement[] {
  const background = (root.agent.background.get(execution.id) ?? []).flatMap(fragment =>
    Number(fragment.receipt.revision) <= through
      ? [
          {
            kind: fragment.slot.kind,
            binding: fragment.binding,
            revision: String(fragment.receipt.revision),
          },
        ]
      : [],
  )
  const model = (root.agent.modelSettlements.get(execution.id) ?? []).flatMap(fragment =>
    Number(fragment.receipt.revision) <= through
      ? [
          {
            kind: 'model' as const,
            binding: fragment.binding,
            revision: String(fragment.receipt.revision),
          },
        ]
      : [],
  )
  return [...background, ...model]
}

/** The urgent inputs that the Agent accepted under their drive operation. */
function urgentOf(root: CommonRoot, execution: MemoryExecution): SessionControlEvidence['urgent'] {
  const tenant = tenantCodec.encode(execution.tenant)
  if (!tenant.ok) corrupt('tenant')
  return execution.inputs.flatMap(input => {
    if (input.priority !== 'urgent') return []
    const operation = deriveDriveOperation({
      kind: 'submit',
      execution: execution.id,
      input: String(input.id) as InputId,
    })
    const original = root.agent.operations.get(
      operationText(tenant.value, execution.id, operation as never),
    )
    return original?.kind === 'committed'
      ? [{ input: String(input.id) as InputId, message: input.content, origin: input.source }]
      : []
  })
}

/**
 * The neutral evidence of control `records` of `execution` as of revision `through`. It throws a
 * HistoryFailure for a missing or contradictory original.
 */
export function controlEvidence(
  root: CommonRoot,
  execution: MemoryExecution,
  records: readonly ControlRecord[],
  through: number,
): SessionControlEvidence {
  return {
    through: String(through),
    // A suspend names no Session responsibility and is never the drive of a Session control.
    records: records
      .filter((record): record is Commanded => record.command.kind !== 'suspend')
      .map(record => recordEvidence(root, execution, record)),
    settled: settledOf(root, execution, through),
    urgent: urgentOf(root, execution),
  }
}

/** The evidence of one control event: the control records captured with it, at its revision. */
export function controlEventEvidence(
  root: CommonRoot,
  execution: MemoryExecution,
  event: AgentEvent,
): SessionControlEvidence {
  const records = root.agent.controls.get(`${execution.id}\0${event.sequence}`)
  if (!records) unavailable('original control event material')
  const original = root.agent.eventReceipts.get(`${execution.id}\0${event.sequence}`)
  if (!original || canonical(original.evidence) !== canonical(event.cause))
    unavailable('control event original revision')
  return controlEvidence(root, execution, records, Number(original.revision))
}

/** Session's decision on `evidence` against the Session state of the root (memory reference). */
export function decideOnRoot(
  root: CommonRoot,
  execution: MemoryExecution,
  evidence: SessionControlEvidence,
): readonly SessionLogConsequence[] {
  const state = root.session
  if (!state) unavailable('Session')
  const run = root.sources.runs.get(execution.id)?.run
  if (run === undefined) unavailable('execution original Run')
  const decided = decideControlConsequences({
    snapshot: state.snapshot,
    execution: execution.id,
    run,
    attempts: root.sources.attemptsByExecution.get(execution.id) ?? [],
    origins: [...root.sources.controls].map(([operation, origin]) => ({
      operation: operation as never,
      execution: origin.execution,
    })),
    evidence,
  })
  if ('failure' in decided) throw new HistoryFailure(decided.failure)
  return decided.ok
}

export function normalizeControl(
  root: CommonRoot,
  execution: MemoryExecution,
  event: AgentEvent,
): readonly SessionLogConsequence[] {
  return decideOnRoot(root, execution, controlEventEvidence(root, execution, event))
}

export function normalizeControls(
  root: CommonRoot,
  execution: MemoryExecution,
  records: readonly ControlRecord[],
  through = execution.revision,
): readonly SessionLogConsequence[] {
  return decideOnRoot(root, execution, controlEvidence(root, execution, records, through))
}
