import type { RuntimeOptions } from './runtime-types.ts'
import { checkedSource } from './admission-values.ts'
import { createHash } from 'node:crypto'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  isJsonNumber,
  writeJsonLossless,
  type JsonValue,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { checkKey } from '@omne-harness-lite/session-log'
import { checkSessionFact, type CreateSessionInput } from '@omne-harness-lite/session-runtime'
import { InvalidStateInput } from './state-values.ts'

export function creationInput(value: unknown, limit: number): CreateSessionInput {
  const data = creationObject(value, limit)
  validateCreationFields(data)
  return Object.freeze(data) as unknown as CreateSessionInput
}
function creationObject(value: unknown, limit: number): JsonObject {
  const copied = copyJsonValue(value)
  if ('failed' in copied || Buffer.byteLength(writeJsonLossless(copied.ok)) > limit)
    throw new InvalidStateInput()
  const owned = copied.ok
  if (!owned || typeof owned !== 'object' || Array.isArray(owned) || isJsonNumber(owned))
    throw new InvalidStateInput()
  return owned as JsonObject
}
function validateCreationFields(data: JsonObject): void {
  const keys = ['operationKey', 'definition', 'executionType', 'mode', 'collaboration', 'workspace']
  if (!Object.keys(data).every(key => keys.includes(key)) || !checkKey(data.operationKey))
    throw new InvalidStateInput()
  const checked = checkSessionFact({
    kind: 'session_created',
    operation: {
      tenant: { organization: 'validation', account: 'validation' },
      principal: 'validation',
      operation: 'createSession',
      operationKey: data.operationKey,
      session: null,
    },
    definition: data.definition,
    executionType: data.executionType,
    mode: data.mode,
    collaboration: data.collaboration,
    workspace: data.workspace ?? null,
    at: '2000-01-01T00:00:00Z',
  })
  if (
    'failure' in checked ||
    checked.fact.kind !== 'session_created' ||
    ('workspace' in data && typeof data.workspace !== 'string')
  )
    throw new InvalidStateInput()
}
/** Sorted object members and exact numeric values define local operation semantics; arrays retain order. */
export function runtimeSemantic(value: unknown, limit: number): string {
  const copied = copyJsonValue(value)
  if ('failed' in copied || Buffer.byteLength(writeJsonLossless(copied.ok)) > limit)
    throw new InvalidStateInput()
  return createHash('sha256')
    .update('session-operation/1\0')
    .update(canonical(copied.ok))
    .digest('hex')
}
function canonical(value: JsonValue): string {
  if (isJsonNumber(value)) return ExactDecimal.from(value).toCanonicalString()
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${writeJsonLossless(key)}:${canonical((value as JsonObject)[key]!)}`)
      .join(',')}}`
  return writeJsonLossless(value)
}
export class RuntimeRejection extends Error {
  constructor(
    readonly failure:
      | 'invalidInput'
      | 'denied'
      | 'unavailable'
      | 'conflict'
      | 'identityConflict'
      | 'notFound'
      | 'notAccepting',
  ) {
    super(`local Session operation: ${failure}`)
  }
}

export async function currentAdmissionSource(options: RuntimeOptions) {
  const current = options.readAdmissionSource
    ? await options.readAdmissionSource()
    : { source: options.source }
  if ('failure' in current) return current
  const source = checkedSource(current.source)
  return source.centerId === options.source.centerId &&
    source.accountId === options.source.accountId
    ? { source }
    : { failure: 'loginRequired' as const }
}
