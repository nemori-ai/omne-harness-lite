import {createCredentialRedactionPolicy} from '@omne-harness-lite/model-request-runtime'
import {createDefaultRetryImplementation} from '@omne-harness-lite/model-request-runtime-local'
import { type RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import {type TransportOptions} from '@omne-harness-lite/pi-ai-transport'
import type { ModelRequestDeployment } from './types.ts'

function validRetirement(value: RetirementPolicy | undefined): value is RetirementPolicy {
  return (
    value != null &&
    Number.isSafeInteger(value.waitMilliseconds) &&
    value.waitMilliseconds > 0 &&
    typeof value.force === 'boolean' &&
    typeof value.schedule === 'function'
  )
}

export function prepareModelRequestDeployment(
  input: ModelRequestDeployment | undefined,
  development: Pick<TransportOptions, 'baseUrl' | 'tls'> | undefined,
): ModelRequestDeployment {
  if (
    input === undefined ||
    input === null ||
    !Number.isSafeInteger(input.maxScopes) ||
    input.maxScopes < 1 ||
    typeof input.acknowledgementCleanup?.next !== 'function' ||
    input.callReferences === undefined ||
    input.callReferences === null ||
    !Number.isSafeInteger(input.callReferences.maxScopes) ||
    input.callReferences.maxScopes < 1 ||
    input.callReferences.content === undefined ||
    input.callReferences.content === null ||
    !Number.isSafeInteger(input.callReferences.content.maxConcurrentWrites) ||
    input.callReferences.content.maxConcurrentWrites < 1 ||
    !Number.isSafeInteger(input.callReferences.content.maxContentBytes) ||
    input.callReferences.content.maxContentBytes < 1 ||
    input.evaluationInputs === undefined ||
    typeof input.evaluationInputs.storeKey !== 'string' ||
    !input.evaluationInputs.storeKey ||
    !Array.isArray(input.evaluationInputs.deployedOfficial) ||
    typeof input.evaluationInputs.monotonicNow !== 'function' ||
    typeof input.evaluationInputs.prepare !== 'function' ||
    input.registryPolicy === undefined ||
    !Number.isSafeInteger(input.registryPolicy.maxRetries) ||
    input.registryPolicy.maxRetries < 0 ||
    !Number.isSafeInteger(input.registryPolicy.maxInFlight) ||
    input.registryPolicy.maxInFlight < 1 ||
    input.transport === undefined ||
    !Array.isArray(input.transport.definitions) ||
    !Array.isArray(input.transport.inputMeters) ||
    input.transport.policy === undefined ||
    input.transport.imagePreparation === undefined ||
    input.transport.imagePreparation === null ||
    !validRetirement(input.transport.retirement) ||
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
  createDefaultRetryImplementation(input.defaultRetry)
  if (development !== undefined) {
    if (development.baseUrl === undefined) throw new Error('controlled transport URL required')
    const url = new URL(development.baseUrl)
    if (url.protocol !== 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('controlled transport must be local HTTPS')
  }
  // The public transport constructor owns and validates complete nested definitions/policy.
  return Object.freeze({
    ...input,
    acknowledgementCleanup: input.acknowledgementCleanup,
    callReferences: Object.freeze({
      maxScopes: input.callReferences.maxScopes,
      content: Object.freeze({ ...input.callReferences.content }),
    }),
    evaluationInputs: Object.freeze({ ...input.evaluationInputs }),
    registryPolicy: Object.freeze({ ...input.registryPolicy }),
    defaultRetry: Object.freeze({
      policy: Object.freeze({ ...input.defaultRetry.policy }),
      sample: input.defaultRetry.sample,
    }),
    transport: Object.freeze({
      definitions: input.transport.definitions,
      inputMeters: input.transport.inputMeters,
      policy: input.transport.policy,
      imagePreparation: Object.freeze({ ...input.transport.imagePreparation }),
      retirement: Object.freeze({ ...input.transport.retirement }),
    }),
    invocation: Object.freeze({ ...input.invocation }),
    settlement: Object.freeze({ ...input.settlement }),
  })
}
