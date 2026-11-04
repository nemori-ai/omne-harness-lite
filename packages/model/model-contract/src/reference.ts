import { mintInvocationReference, mintOperationReference } from './mint.ts'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeModelCallId, decodeModelOperationId } from './identity-values.ts'
import type { ModelCallId, ModelOperationId } from './root.ts'

declare const invocationReference: unique symbol
declare const operationReference: unique symbol
export type ModelInvocationRef = string & { readonly [invocationReference]: true }
export type ModelOperationRef = string & { readonly [operationReference]: true }
export type ModelInvocationParts = Readonly<{
  tenant: TenantId
  call: ModelCallId
  admission: ModelOperationId
}>
export type ModelOperationParts = ModelInvocationParts & Readonly<{ operation: ModelOperationId }>
export const MODEL_REFERENCE_MAX_LENGTH = 1024
export type ModelReferenceRejection = Readonly<{
  field: 'ModelInvocationRef' | 'ModelOperationRef'
  reason:
    | 'type'
    | 'length'
    | 'syntax'
    | 'domain'
    | 'version'
    | 'shape'
    | 'identity'
    | 'reserved'
    | 'unreadable'
}>
/**
 * Why a reference does not resolve for the presented tenant. Version 2 carries no tenant (R2-D357),
 * so no failure names another tenant: a reference of another tenant resolves to the caller's tenant
 * and locates nothing in its partition, and the store-backed entry answers it as it answers a call
 * that does not exist (R2-D370).
 */
export type ModelReferenceFailure =
  | Readonly<{ kind: 'malformed'; rejection: ModelReferenceRejection }>
  | Readonly<{ kind: 'invalid-tenant' }>

/** The only reference version this codec reads or writes. Version 1 texts are refused. */
const VERSION = 2

type Field = ModelReferenceRejection['field']
type Parsed = Readonly<{
  call: ModelCallId
  admission: ModelOperationId
  operation: ModelOperationId | null
}>
function reject(field: Field, reason: ModelReferenceRejection['reason']) {
  return fail<ModelReferenceRejection>({ field, reason })
}
function operation(
  value: unknown,
  field: Field,
): Outcome<ModelOperationId, ModelReferenceRejection> {
  const decoded = decodeModelOperationId(value)
  if ('failure' in decoded) return reject(field, 'identity')
  return decoded.ok.startsWith('mop_--') ? reject(field, 'reserved') : decoded
}
function partsOf(
  callText: unknown,
  admissionText: unknown,
  operationText: unknown,
  field: Field,
): Outcome<Parsed, ModelReferenceRejection> {
  const call = decodeModelCallId(callText)
  if ('failure' in call) return reject(field, 'identity')
  const admission = operation(admissionText, field)
  if ('failure' in admission) return admission
  if (field === 'ModelInvocationRef')
    return succeed({ call: call.ok, admission: admission.ok, operation: null })
  const action = operation(operationText, field)
  if ('failure' in action) return action
  return succeed({ call: call.ok, admission: admission.ok, operation: action.ok })
}
function parse(text: unknown, field: Field): Outcome<Parsed, ModelReferenceRejection> {
  if (typeof text !== 'string') return reject(field, 'type')
  if (text.length > MODEL_REFERENCE_MAX_LENGTH) return reject(field, 'length')
  let tuple: unknown
  try {
    tuple = JSON.parse(text)
  } catch {
    return reject(field, 'syntax')
  }
  if (!Array.isArray(tuple)) return reject(field, 'shape')
  const domain = field === 'ModelInvocationRef' ? 'model-invocation' : 'model-operation'
  if (tuple[0] !== domain) return reject(field, 'domain')
  if (tuple[1] !== VERSION) return reject(field, 'version')
  if (tuple.length !== (field === 'ModelInvocationRef' ? 4 : 5)) return reject(field, 'shape')
  return partsOf(tuple[2], tuple[3], tuple[4], field)
}
function captureDescriptors(
  value: object,
  keys: readonly string[],
  field: Field,
): Outcome<PropertyDescriptorMap, ModelReferenceRejection> {
  let descriptors: PropertyDescriptorMap
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return reject(field, 'shape')
    descriptors = Object.getOwnPropertyDescriptors(value)
    const own = Reflect.ownKeys(descriptors)
    if (
      own.length !== keys.length ||
      own.some(key => typeof key !== 'string' || !keys.includes(key))
    )
      return reject(field, 'shape')
  } catch {
    return reject(field, 'unreadable')
  }
  return succeed(descriptors)
}
/** Capture closed data fields without reading accessors or invoking toJSON. */
function capture(value: unknown, field: Field): Outcome<Parsed, ModelReferenceRejection> {
  if (typeof value !== 'object' || value === null) return reject(field, 'shape')
  const keys =
    field === 'ModelInvocationRef'
      ? ['tenant', 'call', 'admission']
      : ['tenant', 'call', 'admission', 'operation']
  const captured = captureDescriptors(value, keys, field)
  if ('failure' in captured) return captured
  const descriptors = captured.ok
  if (keys.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]!)))
    return reject(field, 'shape')
  // The tenant is not part of the text, but a reference is encoded only for a minted tenant.
  if (!tenantCodec.encode(descriptors.tenant!.value).ok) return reject(field, 'identity')
  return partsOf(
    descriptors.call!.value,
    descriptors.admission!.value,
    descriptors.operation?.value,
    field,
  )
}
/** The text carries no tenant: the caller's Access and its storage partition locate the tenant. */
function canonical(parts: Parsed): string {
  return JSON.stringify(
    parts.operation === null
      ? ['model-invocation', VERSION, parts.call, parts.admission]
      : ['model-operation', VERSION, parts.call, parts.admission, parts.operation],
  )
}
/** Available before admit. The reference locates an invocation and grants no access. */
export function encodeModelInvocationRef(
  parts: ModelInvocationParts,
): Outcome<ModelInvocationRef, ModelReferenceRejection> {
  const parsed = capture(parts, 'ModelInvocationRef')
  return 'failure' in parsed ? parsed : succeed(mintInvocationReference(canonical(parsed.ok)))
}
export function encodeModelOperationRef(
  parts: ModelOperationParts,
): Outcome<ModelOperationRef, ModelReferenceRejection> {
  const parsed = capture(parts, 'ModelOperationRef')
  return 'failure' in parsed ? parsed : succeed(mintOperationReference(canonical(parsed.ok)))
}
export function decodeModelInvocationRef(
  text: unknown,
): Outcome<ModelInvocationRef, ModelReferenceRejection> {
  const parsed = parse(text, 'ModelInvocationRef')
  return 'failure' in parsed ? parsed : succeed(mintInvocationReference(canonical(parsed.ok)))
}
export function decodeModelOperationRef(
  text: unknown,
): Outcome<ModelOperationRef, ModelReferenceRejection> {
  const parsed = parse(text, 'ModelOperationRef')
  return 'failure' in parsed ? parsed : succeed(mintOperationReference(canonical(parsed.ok)))
}
/**
 * Locate the reference in the presented tenant. The reference has no tenant of its own, so a
 * reference of another tenant resolves here to parts of the caller's tenant and the store-backed
 * entry finds no such call: the same answer as for a call that never existed.
 */
function resolve(
  reference: unknown,
  tenant: TenantId,
  field: Field,
): Outcome<Parsed, ModelReferenceFailure> {
  if (!tenantCodec.encode(tenant).ok) return fail({ kind: 'invalid-tenant' })
  const parsed = parse(reference, field)
  return 'failure' in parsed ? fail({ kind: 'malformed', rejection: parsed.failure }) : parsed
}
/** Return the current minted tenant object, never a reconstructed credential. */
export function resolveModelInvocationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ModelInvocationParts, ModelReferenceFailure> {
  const parsed = resolve(reference, tenant, 'ModelInvocationRef')
  if ('failure' in parsed) return parsed
  const { call, admission } = parsed.ok
  return succeed(Object.freeze({ tenant, call, admission }))
}
export function resolveModelOperationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ModelOperationParts, ModelReferenceFailure> {
  const parsed = resolve(reference, tenant, 'ModelOperationRef')
  if ('failure' in parsed) return parsed
  const { call, admission, operation } = parsed.ok
  if (operation === null) throw new TypeError('parsed operation reference has no operation')
  return succeed(Object.freeze({ tenant, call, admission, operation }))
}
