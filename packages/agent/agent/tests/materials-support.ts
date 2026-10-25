// A real, immutable, qualified in-memory material store for the Loop tests. Its declared evidence
// owner is the Agent consumer owner. The locator resolves stored content; a digest alone proves nothing.
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  decodeAgentExecutionId,
  decodeStepId,
  type Access,
  type AgentMaterials,
  type DurableEvidence,
  type Material,
} from '@omne-harness/agent-contract'
import type { AgentDependencies } from '@omne-harness/agent'
import type { AckInput, ModelRuntime } from '@omne-harness/model-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { AGENT_OWNER } from '../src/loop/identities.ts'
import { mainConsumption } from '../src/loop/identities.ts'
import { readProcessedModelMaterial } from '@omne-harness/agent'
import { operation } from './journal-support.ts'

export function memoryMaterials<P>(owner = AGENT_OWNER): AgentMaterials<P, ContentBlock> {
  type Stored = {
    principal: P
    tenant: Access<P>['tenant']
    source: DurableEvidence
    consumer: unknown
    value: Material<ContentBlock>
  }
  const stored = new Map<string, Stored>()
  return {
    async preserve(input) {
      if (input.consumer.owner !== AGENT_OWNER)
        return fail({ kind: 'denied', action: 'materials.preserve' })
      const key = JSON.stringify([input.tenant, input.identity])
      const previous = stored.get(key)
      if (previous) {
        if (!Object.is(previous.principal, input.principal))
          return fail({ kind: 'denied', action: 'materials.preserve' })
        return isDeepStrictEqual(previous.value, input.value) &&
          isDeepStrictEqual(previous.consumer, input.consumer)
          ? succeed(structuredClone(previous.source))
          : fail({ kind: 'conflict', operation: operation('material-preserve') })
      }
      const source = {
        owner,
        record: key,
        revision: '1',
        digest: createHash('sha256').update(JSON.stringify(input.value)).digest('hex'),
      }
      stored.set(key, {
        principal: input.principal,
        tenant: input.tenant,
        source,
        consumer: structuredClone(input.consumer),
        value: structuredClone(input.value),
      })
      return succeed(structuredClone(source))
    },
    async read(input) {
      const found = stored.get(input.source.record)
      if (
        !found ||
        !isDeepStrictEqual(found.tenant, input.tenant) ||
        !Object.is(found.principal, input.principal) ||
        !isDeepStrictEqual(found.source, input.source)
      )
        return fail({ kind: 'denied', action: 'materials.read' })
      return succeed(structuredClone(found.value))
    },
  }
}

/** An evidence adapter with actual reads and qualification. It never accepts a bare hash or an
 * expectEvidence flag. The scripted provider itself has no such adapter contract enforcement. */
export function proofModels<P>(d: AgentDependencies<P, ContentBlock>): ModelRuntime<P> {
  const admitted = new Map<string, Parameters<ModelRuntime<P>['calls']['admit']>[0]>()
  const key = (tenant: Access<P>['tenant'], call: string) => JSON.stringify([tenant, call])
  async function valid(input: AckInput<P>) {
    const original = admitted.get(key(input.tenant, input.call))
    if (
      !original ||
      !Object.is(original.principal, input.principal) ||
      input.evidence.kind !== 'processed' ||
      input.evidence.completion.owner !== original.consumer.owner
    )
      return false
    const cut = original.consumer.work.lastIndexOf('/')
    const execution = decodeAgentExecutionId(original.consumer.work.slice(0, cut)),
      step = decodeStepId(original.consumer.work.slice(cut + 1))
    if ('failure' in execution || 'failure' in step) return false
    const read = await d.materials.read({ ...input, source: input.evidence.completion })
    const saved = await d.journal.load({ ...input, execution: execution.ok })
    if (
      'failure' in read ||
      'failure' in saved ||
      saved.ok.executionAttachment === null ||
      saved.ok.state.kind === 'ended'
    )
      return false
    const consumption = mainConsumption(step.ok)
    const binding = saved.ok.results.find(
      r =>
        r.consumption === consumption &&
        r.result.producer.kind === 'model' &&
        r.result.producer.call === input.call &&
        r.result.version === input.result,
    )
    if (!binding || !isDeepStrictEqual(binding.completion, input.evidence.completion)) return false
    const effect = saved.ok.effects.find(
      e => e.pending.kind === 'model' && e.pending.consumption === consumption,
    )
    if (!effect || !isDeepStrictEqual(saved.ok.executionAttachment, effect.authority)) return false
    const pending = effect.pending
    if (pending?.kind !== 'model' || !isDeepStrictEqual(pending.position, original.consumer))
      return false
    const state = await d.models.calls.inspect({ ...input, reference: pending.reference })
    if (
      'failure' in state ||
      state.ok.kind !== 'found' ||
      state.ok.state.phase !== 'settled' ||
      state.ok.state.settlement.version !== input.result ||
      !isDeepStrictEqual(state.ok.state.consumer, original.consumer)
    )
      return false
    const decoded = readProcessedModelMaterial(read.ok, {
      tenant: input.tenant,
      execution: execution.ok,
      step: step.ok,
      consumption,
      consumer: original.consumer,
      produced: binding.result,
    })
    return 'ok' in decoded
  }
  return {
    ...d.models,
    calls: {
      ...d.models.calls,
      async admit(input) {
        if (!admitted.has(key(input.tenant, input.call)))
          admitted.set(key(input.tenant, input.call), structuredClone(input))
        return d.models.calls.admit(input)
      },
    },
    consumption: {
      ...d.models.consumption,
      async acknowledge(input) {
        if (!(await valid(input)))
          return fail({
            kind: 'handoff-invalid',
            reason: 'no qualified, immutable processed material and established Journal binding',
          })
        return d.models.consumption.acknowledge(input)
      },
    },
  }
}
