import { copyJsonValue, type JsonObject } from '@omne-harness-lite/content-blocks'
import { isOk, parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkKey, checkSession } from '@omne-harness-lite/session-log'
import type { OperationRef } from './types.ts'

const invalidInput = Object.freeze({ failure: 'invalidInput' } as const)
export function checkOperationRef(
  value: unknown,
): { readonly kind: 'operation'; readonly operation: OperationRef } | typeof invalidInput {
  const copy = copyJsonValue(value)
  if ('failed' in copy || typeof copy.ok !== 'object' || copy.ok === null || Array.isArray(copy.ok))
    return invalidInput
  const ref = copy.ok as JsonObject
  const keys = ['tenant', 'principal', 'operation', 'operationKey', 'session']
  if (Object.keys(ref).length !== keys.length || !Object.keys(ref).every(key => keys.includes(key)))
    return invalidInput
  if (!validReference(ref)) return invalidInput
  return { kind: 'operation', operation: copy.ok as unknown as OperationRef }
}
export function operationRefEquals(left: OperationRef, right: OperationRef): boolean {
  return (
    tenantIdEquals(left.tenant, right.tenant) &&
    left.principal === right.principal &&
    left.operation === right.operation &&
    left.operationKey === right.operationKey &&
    left.session === right.session
  )
}

function operationKind(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    ['createSession', 'submitInput', 'cancelRun', 'setArchived'].includes(value)
  )
}

function validReference(ref: JsonObject): boolean {
  const tenant = parseTenantId(ref.tenant)
  return (
    isOk(tenant) &&
    checkKey(ref.principal) &&
    checkKey(ref.operationKey) &&
    operationKind(ref.operation) &&
    (ref.operation === 'createSession' ? ref.session === null : 'ok' in checkSession(ref.session))
  )
}
