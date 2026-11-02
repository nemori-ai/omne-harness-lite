import { createHash } from 'node:crypto'
import {
  decodeAgentOperationId,
  type Access,
  type AgentExecutionId,
  type AgentOperationId,
  type ControlRecord,
  type ControlStage,
  type ExecutionSnapshot,
  type Failure,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { decodeModelOperationId, resolveModelInvocationRef } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from './construction.ts'
import { json } from './receiving-values.ts'

type ModelControl = Pick<ControlRecord, 'operation' | 'stages'> &
  Readonly<{
    command: Extract<ControlRecord['command'], { kind: 'interrupt-model' }>
  }>
type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'journal' | 'models' | 'materials'>

const observationSchema = {
  owner: '@omne-harness/agent',
  name: 'model-control-observation',
  revision: '1',
  digest: 'agent:model-control-observation/1',
} as const

export function cancellationOf(snapshot: ExecutionSnapshot): ControlRecord | undefined {
  return snapshot.controls.find(
    record =>
      record.command.kind === 'cancel' && record.stages['intent-established']?.state === 'reached',
  )
}

export function controlOperation(
  execution: AgentExecutionId,
  control: AgentOperationId,
  stage: string,
): AgentOperationId {
  const key = createHash('sha256')
    .update(JSON.stringify([execution, control, stage]))
    .digest('hex')
  const decoded = decodeAgentOperationId(`control/${key}`)
  if ('failure' in decoded) throw new Error('invalid derived Agent control operation')
  return decoded.ok
}

export async function establishCancellation<P>(
  journal: Ports<P>['journal'],
  access: Access<P>,
  execution: AgentExecutionId,
  record: ControlRecord,
): Promise<Outcome<void, Failure>> {
  if (record.command.kind !== 'cancel') return succeed(undefined)
  for (const stage of ['intent-established', 'qualification-revoked'] as const) {
    if (record.stages[stage]?.state === 'reached') continue
    const saved = await journal.recordControl({
      ...access,
      execution,
      operation: controlOperation(execution, record.operation, stage),
      target: record.operation,
      stage,
      state: 'reached',
      source: record.stages.accepted.source,
    })
    if ('failure' in saved) return saved
  }
  return succeed(undefined)
}

/** A control retry only observes a request whose original sending outcome is unresolved. */
export async function advanceModelControl<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  record: ModelControl,
): Promise<Outcome<void, Failure>> {
  const loaded = await ports.journal.load({ ...access, execution })
  if ('failure' in loaded) return loaded
  const pending = [
    ...loaded.ok.checkpoint.calls,
    ...loaded.ok.effects.map(effect => effect.pending),
  ].find(call => {
    if (call.kind !== 'model') return false
    const resolved = resolveModelInvocationRef(call.reference, access.tenant)
    return 'ok' in resolved && resolved.ok.call === record.command.call
  })
  if (pending?.kind !== 'model')
    return fail({
      kind: 'unavailable',
      owner: '@omne-harness/agent',
      diagnostic: 'original model control reference is unavailable',
    })

  const prefix = createHash('sha256')
    .update(JSON.stringify([execution, record.operation]))
    .digest('hex')
  const operation = decodeModelOperationId(`mop_control_${prefix}`)
  if ('failure' in operation) throw new Error('invalid derived model control operation')
  const modelOperation = operation.ok
  const reference = pending.reference

  async function save(
    stage: Exclude<ControlStage, 'accepted' | 'qualification-revoked' | 'duty-released'>,
    state: 'reached' | 'unresolved',
    observation: unknown,
  ): Promise<Outcome<void, Failure>> {
    const identity = `control/${prefix}/${stage}/${state}`
    const materialInput = {
      ...access,
      execution,
      identity,
      consumer: {
        owner: '@omne-harness/agent',
        work: execution,
        position: record.operation,
        purpose: 'model-control',
      },
      value: {
        kind: 'facts' as const,
        schema: observationSchema,
        value: json({
          execution,
          control: record.operation,
          command: record.command,
          reference,
          operation: modelOperation,
          observation,
        }),
      },
    }
    const stored = await ports.materials.preserve(materialInput)
    if ('failure' in stored) return stored
    const recording = decodeAgentOperationId(identity)
    if ('failure' in recording) throw new Error('invalid derived control recording operation')
    const saved = await ports.journal.recordControl({
      ...access,
      execution,
      operation: recording.ok,
      target: record.operation,
      stage,
      state,
      source: stored.ok,
    })
    return 'failure' in saved ? saved : succeed(undefined)
  }

  if (record.stages['intent-established'] === undefined) {
    const saved = await save('intent-established', 'reached', record.stages.accepted)
    if ('failure' in saved) return saved
  }
  if (record.stages['physically-stopped']?.state === 'reached') return succeed(undefined)
  const found = await ports.models.calls.inspect({ ...access, reference: pending.reference })
  if ('failure' in found || found.ok.kind !== 'found') return succeed(undefined)
  if (found.ok.state.phase === 'settled')
    return save('physically-stopped', 'reached', found.ok.state.settlement)
  if (record.stages['producer-confirmed']?.state === 'reached') return succeed(undefined)
  if (found.ok.state.control.kind === 'requested')
    return save('producer-confirmed', 'reached', found.ok.state.control)
  if (record.stages['producer-confirmed']?.state === 'unresolved') return succeed(undefined)

  const prepared = await save('producer-confirmed', 'unresolved', { kind: 'requesting' })
  if ('failure' in prepared) return prepared
  const requested = await ports.models.calls.cancel({
    ...access,
    call: record.command.call,
    operation: operation.ok,
  })
  if ('failure' in requested || requested.ok.kind !== 'requested') return succeed(undefined)
  return save('producer-confirmed', 'reached', requested.ok)
}
