import { createCredentialRedactionPolicy } from '@omne-harness-lite/model-request-runtime'
import { type TransportOptions } from '@omne-harness-lite/pi-ai-transport'
import type { ModelRequestDeployment } from './types.ts'

export function prepareModelRequestDeployment(
  input: ModelRequestDeployment | undefined,
  development: Pick<TransportOptions, 'baseUrl' | 'tls'> | undefined,
): ModelRequestDeployment {
  if (
    input === undefined ||
    input === null ||
    input.evaluationInputs === undefined ||
    typeof input.evaluationInputs.storeKey !== 'string' ||
    !input.evaluationInputs.storeKey ||
    !Array.isArray(input.evaluationInputs.deployedOfficial) ||
    typeof input.evaluationInputs.monotonicNow !== 'function' ||
    typeof input.evaluationInputs.prepare !== 'function' ||
    input.transport === undefined ||
    !Array.isArray(input.transport.definitions) ||
    input.transport.policy === undefined ||
    input.invocation === undefined ||
    typeof input.invocation.now !== 'function' ||
    typeof input.invocation.schedule !== 'function' ||
    input.invocation.statusCauseTable === undefined ||
    typeof input.invocation.firstContentTimeoutMs !== 'number' ||
    typeof input.invocation.idleContentTimeoutMs !== 'number' ||
    !Number.isFinite(input.invocation.firstContentTimeoutMs) ||
    !Number.isFinite(input.invocation.idleContentTimeoutMs) ||
    input.invocation.firstContentTimeoutMs <= 0 ||
    input.invocation.idleContentTimeoutMs <= 0 ||
    input.reservationWaitPolicy === undefined ||
    input.settlement === undefined ||
    input.settlement.contention === undefined ||
    input.settlement.scheduler === undefined ||
    (input.assetRegistry !== undefined && typeof input.assetRegistry.lookup !== 'function')
  )
    throw new Error('acceptance request deployment invalid')
  createCredentialRedactionPolicy(input.invocation.credentialRedaction)
  createCredentialRedactionPolicy(input.transport.policy.credentialRedaction)
  if (development !== undefined) {
    if (development.baseUrl === undefined) throw new Error('controlled transport URL required')
    const url = new URL(development.baseUrl)
    if (url.protocol !== 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('controlled transport must be local HTTPS')
  }
  // The public transport constructor owns and validates complete nested definitions/policy.
  return Object.freeze({
    ...input,
    evaluationInputs: Object.freeze({ ...input.evaluationInputs }),
    transport: Object.freeze({
      definitions: input.transport.definitions,
      inputMeters: input.transport.inputMeters,
      policy: input.transport.policy,
    }),
    invocation: Object.freeze({ ...input.invocation }),
    settlement: Object.freeze({ ...input.settlement }),
  })
}
