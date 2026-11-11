import type {
  Access,
  ActionBatch,
  ActionToolCall,
  AgentExecutionId,
  Failure,
  StepId,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelDelivery } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import { readModelDeliveryMaterial } from '../receiving-material.ts'
import { consumeModelResult } from './model-result.ts'
import { invocationParts, mainConsumption } from './identities.ts'

type Dependencies<P> = AgentDependencies<P, ContentBlock>
type Sources<P> = Readonly<{
  entries: Pick<Dependencies<P>['entries'], 'receivedOf'>
  materials: Pick<Dependencies<P>['materials'], 'read'>
}>

async function readBatchDelivery<P>(
  ports: Sources<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  step: StepId,
  batch: ActionBatch,
): Promise<Outcome<Extract<ModelDelivery, { kind: 'result' }>, Failure>> {
  const source = batch.source
  if (source.producer.kind !== 'model')
    return fail({ kind: 'invalid', field: 'batch.source', reason: 'not a Model reply' })
  const call = source.producer.call
  const received = await ports.entries.receivedOf({
    ...access,
    execution,
    consumption: mainConsumption(execution, step),
  })
  if ('failure' in received) return received
  const found = received.ok.find(
    entry =>
      entry.delivery.producer === 'model' &&
      entry.delivery.key.kind === 'result' &&
      entry.delivery.key.result === source.version &&
      invocationParts(entry.delivery.key.reference, access.tenant).call === call,
  )
  if (found === undefined)
    return fail({
      kind: 'unavailable',
      owner: 'agentJournal',
      diagnostic: 'the received reply of the batch is not available',
    })
  const { material: from, ...expected } = found
  const material = await ports.materials.read({ ...access, source: from })
  if ('failure' in material) return material
  const delivery = readModelDeliveryMaterial(access, material.ok, expected)
  if (!delivery || delivery.kind !== 'result')
    return fail({
      kind: 'invalid',
      field: 'received.material',
      reason: 'invalid schema or original binding',
    })
  return succeed(delivery)
}

/** Restores a batch's original calls through the received entry and its original material. */
export async function readBatchToolCalls<P>(
  ports: Sources<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  step: StepId,
  batch: ActionBatch,
): Promise<Outcome<ReadonlyMap<string, ActionToolCall>, Failure>> {
  const delivery = await readBatchDelivery(ports, access, execution, step, batch)
  if ('failure' in delivery) return delivery
  const result = consumeModelResult([execution, step], {
    produced: batch.source,
    settlement: delivery.ok.settlement,
    parts: delivery.ok.parts,
  })
  if ('failure' in result) return result
  if (result.ok.kind !== 'reply')
    return fail({ kind: 'invalid', field: 'batch.source', reason: 'not a complete reply' })
  const parts = new Map<string, ActionToolCall>()
  for (const block of result.ok.reply.blocks)
    if (block.kind === 'tool_call') parts.set(block.callId, block)
  return succeed(parts)
}
