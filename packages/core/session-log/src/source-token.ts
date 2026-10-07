import {
  copyJsonValue,
  isNonNegativeJsonInteger,
  LosslessNumber,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { isOk, parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkKey, checkSession, invalidInput, object } from './values.ts'
import { compareInteger } from './numbers.ts'
import type { InvalidInput, JsonNumber, SessionRef, TenantId } from './types.ts'

/** A fixed journal coordinate. This value grants no read or write authority. */
export interface SourceToken {
  readonly tenant: TenantId
  readonly session: SessionRef
  readonly journalGeneration: string
  readonly tail: JsonNumber
}

const sourceFields: readonly string[] = ['tenant', 'session', 'journalGeneration', 'tail']

function validTail(value: unknown): value is JsonNumber {
  if (LosslessNumber.is(value) && Object.getPrototypeOf(value) !== LosslessNumber.prototype)
    return false
  return isNonNegativeJsonInteger(value)
}

function tokenFrom(value: JsonValue): { readonly ok: SourceToken } | InvalidInput {
  if (!object(value) || Object.keys(value).some(key => !sourceFields.includes(key)))
    return invalidInput
  if (value.tenant === undefined || !object(value.tenant)) return invalidInput
  const tenant = parseTenantId(value.tenant)
  const session = checkSession(value.session)
  if (!isOk(tenant) || 'failure' in session) return invalidInput
  if (!checkKey(value.journalGeneration) || !validTail(value.tail)) return invalidInput
  return Object.freeze({
    ok: Object.freeze({
      tenant: Object.freeze(tenant.ok),
      session: session.ok,
      journalGeneration: value.journalGeneration,
      tail: value.tail,
    }),
  })
}

/** Copy and validate before IO. Preserve exact JSON integers without Number coercion. */
export function checkSourceToken(value: unknown): { readonly ok: SourceToken } | InvalidInput {
  const copied = copyJsonValue(value)
  return 'ok' in copied ? tokenFrom(copied.ok) : invalidInput
}

/** Compare validated coordinates. A matching token does not prove source availability. */
export function sourceTokenEquals(left: SourceToken, right: SourceToken): boolean {
  return (
    tenantIdEquals(left.tenant, right.tenant) &&
    left.session === right.session &&
    left.journalGeneration === right.journalGeneration &&
    compareInteger(left.tail, right.tail) === 0
  )
}
