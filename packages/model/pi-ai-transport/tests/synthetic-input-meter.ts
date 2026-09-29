import { testImagePreparerFor } from './image-transport-support.ts'
import type { PlanInput, PlanResult } from '@omne-harness-lite/model-request-runtime'
import {
  defineInputMeter,
  planRequest as planRequestWithMeter,
  type InputMeter,
  type ModelDefinition,
  type PlannedRequest,
} from '@omne-harness-lite/pi-ai-transport'

const meters = new WeakMap<ModelDefinition, Map<string, InputMeter>>()

/** Offline route/projection fixture only; it does not certify any upstream token count. */
export function syntheticInputMeter(definition: ModelDefinition, provider: string): InputMeter {
  let routes = meters.get(definition)
  if (!routes) {
    routes = new Map()
    meters.set(definition, routes)
  }
  const prior = routes.get(provider)
  if (prior) return prior
  const meter: InputMeter = defineInputMeter({
    modelId: definition.modelId,
    definitionRevision: definition.revision,
    implementation: definition.implementation,
    provider,
    algorithmRevision: 'synthetic-route-tests-1',
    evidence: 'offline fixture only; no official route-counting claim',
    measureFull: () => ({ kind: 'exact' as const, tokens: 1 }),
  })
  routes.set(provider, meter)
  return meter
}

/** Existing projection assertions use an explicit controlled meter. */
export async function planRequest(
  input: PlanInput,
  definitions: readonly ModelDefinition[],
): Promise<PlanResult<PlannedRequest>> {
  const definition = definitions.find(
    candidate =>
      candidate.modelId === input.routeName &&
      candidate.revision === input.snapshot?.adaptation?.definition?.revision &&
      candidate.implementation.name === input.snapshot?.adaptation?.implementation?.name &&
      candidate.implementation.revision === input.snapshot?.adaptation?.implementation?.revision,
  )
  const meter = definition && syntheticInputMeter(definition, input.provider)
  return await planRequestWithMeter(
    input,
    definitions,
    meter,
    {
      signal: new AbortController().signal,
    },
    testImagePreparerFor(planRequestWithMeter),
  )
}
