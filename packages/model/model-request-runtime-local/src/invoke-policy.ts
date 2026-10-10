import { validate, type RawHeaders, type UpstreamError } from '@omne-harness-lite/model-response'
import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type { BoundCredentialRedaction } from '@omne-harness-lite/model-request-runtime'
import type { TransportFailure } from '@omne-harness-lite/model-request-runtime'

function ownedHeaderList(item: unknown): boolean {
  if (
    !Array.isArray(item) ||
    !Object.isFrozen(item) ||
    Object.getPrototypeOf(item) !== Array.prototype
  )
    return false
  const elements = Object.getOwnPropertyDescriptors(item)
  if (Reflect.ownKeys(item).length !== item.length + 1) return false
  for (let index = 0; index < item.length; index++) {
    const element = elements[String(index)]
    if (
      !element ||
      !element.enumerable ||
      !('value' in element) ||
      typeof element.value !== 'string'
    )
      return false
  }
  return true
}

function ownedHeaderField(descriptor: PropertyDescriptor): boolean {
  if (!descriptor.enumerable || !('value' in descriptor)) return false
  const item: unknown = descriptor.value
  if (typeof item === 'string') return true
  return ownedHeaderList(item)
}

/** Validate the sender's already owned immutable value; never copy or re-redact H. */
export function ownedHeaders(value: unknown): value is RawHeaders {
  try {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !Object.isFrozen(value)
    )
      return false
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return false
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) return false
    for (const descriptor of Object.values(descriptors)) {
      if (!ownedHeaderField(descriptor)) return false
    }
    return true
  } catch {
    return false
  }
}
function upstreamError(value: JsonValue): value is UpstreamError {
  return validate('UpstreamError', value).valid
}
function processFailureJson(
  fact: TransportFailure,
  bound: BoundCredentialRedaction,
  diagnose: (kind: string) => void,
): { readonly error: UpstreamError | undefined; readonly stage: string | undefined } {
  let error: UpstreamError | undefined, stage: string | undefined
  if (fact.upstreamError !== undefined) {
    try {
      const processed = bound.json(fact.upstreamError)
      if ('rejected' in processed || !upstreamError(processed.ok)) {
        stage = 'failure_json_policy'
        diagnose('model_invocation.failure_json_rejected')
      } else error = processed.ok
    } catch {
      stage = 'failure_json_policy'
      diagnose('model_invocation.failure_json_defect')
    }
  }
  return { error, stage }
}
function processFailureText(
  fact: TransportFailure,
  bound: BoundCredentialRedaction,
  diagnose: (kind: string) => void,
  stage: string | undefined,
): { readonly local: string | undefined; readonly stage: string | undefined } {
  let local: string | undefined
  if (fact.localError !== undefined) {
    try {
      const processed = bound.text(fact.localError)
      if ('rejected' in processed) {
        stage ??= 'failure_text_policy'
        diagnose('model_invocation.failure_text_rejected')
      } else local = processed.ok
    } catch {
      stage ??= 'failure_text_policy'
      diagnose('model_invocation.failure_text_defect')
    }
  }
  return { local, stage }
}
/** Only bound processor calls are caught, never arbitrary model/clock/assembler exceptions. */
export function processFailure(
  fact: TransportFailure,
  bound: BoundCredentialRedaction,
  diagnose: (kind: string) => void,
): { readonly fact: TransportFailure; readonly processingFailed: boolean } {
  const { error, stage: jsonStage } = processFailureJson(fact, bound, diagnose)
  const { local, stage } = processFailureText(fact, bound, diagnose, jsonStage)
  const base = {
    source: fact.source,
    ...(fact.httpStatus === undefined ? {} : { httpStatus: fact.httpStatus }),
    ...(fact.queued === undefined ? {} : { queued: fact.queued }),
    ...(error === undefined ? {} : { upstreamError: error }),
    ...(stage === undefined
      ? local === undefined
        ? {}
        : { localError: local }
      : { localError: stage }),
  }
  return {
    fact: fact.inBand
      ? { ...base, inBand: true, statusCode: fact.statusCode }
      : { ...base, ...(fact.statusCode === undefined ? {} : { statusCode: fact.statusCode }) },
    processingFailed: stage !== undefined,
  }
}
