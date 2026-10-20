import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ToolCallId,
  type ToolOperationId,
} from './identity.ts'

declare const toolInvocationRef: unique symbol
declare const toolOperationRef: unique symbol
export type ToolInvocationRef = string & { readonly [toolInvocationRef]: true }
export type ToolOperationRef = string & { readonly [toolOperationRef]: true }

/**
 * Why a text is not a reference. `type`: not a string, not JSON, not an array, or a marker of
 * another kind. `version`: a version other than 1. `shape`: the wrong element count, or an
 * element that is not the tenant text or the identity it must be. `length`: the text is longer
 * than the longest encodable reference.
 */
export type ToolReferenceRejection = Readonly<{
  field: 'ToolInvocationRef' | 'ToolOperationRef'
  reason: 'type' | 'version' | 'shape' | 'length'
}>

/** A malformed reference, or a valid reference whose tenant differs from the access tenant. */
export type ToolReferenceFailure =
  | Readonly<{ kind: 'malformed'; rejection: ToolReferenceRejection }>
  | Readonly<{ kind: 'foreign-tenant' }>

export type ToolInvocationParts = Readonly<{
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
}>
export type ToolOperationParts = ToolInvocationParts & Readonly<{ operation: ToolOperationId }>

/**
 * The longest reference text, in UTF-16 code units. A legal-identity atomic text is 30 characters
 * (4 prefix, 26 body), so the canonical tenantCodec text is 92. As an array element it is quoted
 * and its eight quotes are escaped: 102. A Tool identity takes up to 256 characters, and the worst
 * JSON escaping doubles each: 514 with quotes. The operation form is then
 * `["tool-operation",1,` (20) + tenant (102) + three identities with their separators (3 × 515)
 * + `]`: 1668. The invocation form replaces the operation part: 1154. This limit does not borrow
 * the 256 of one Tool identity text.
 */
export const TOOL_REFERENCE_MAX_LENGTH = 1668

const VERSION = 1

type RefKind = ToolReferenceRejection['field']

function rejected<K extends RefKind>(
  field: K,
  reason: ToolReferenceRejection['reason'],
): Outcome<never, ToolReferenceRejection> {
  return fail({ field, reason })
}

function canonicalTenant(
  field: RefKind,
  tenant: TenantId,
): Outcome<string, ToolReferenceRejection> {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? succeed(encoded.value) : rejected(field, 'type')
}

function identityText(
  field: RefKind,
  decode: (text: unknown) => Outcome<string, unknown>,
  text: string,
): Outcome<string, ToolReferenceRejection> {
  return 'ok' in decode(text) ? succeed(text) : rejected(field, 'type')
}

/**
 * Encodes the invocation reference. It fails only when a part is not what its brand claims: the
 * tenant must be a legal-identity tenant and the identities must decode. The codec reads no
 * store and mints no identity.
 */
export function encodeToolInvocationRef(
  parts: ToolInvocationParts,
): Outcome<ToolInvocationRef, ToolReferenceRejection> {
  const field = 'ToolInvocationRef' as const
  const tenant = canonicalTenant(field, parts.tenant)
  if ('failure' in tenant) return tenant
  const call = identityText(field, decodeToolCallId, parts.call)
  if ('failure' in call) return call
  const admission = identityText(field, decodeToolOperationId, parts.admission)
  if ('failure' in admission) return admission
  const text = JSON.stringify(['tool-invocation', VERSION, tenant.ok, call.ok, admission.ok])
  return succeed(text as ToolInvocationRef)
}

/** Encodes the operation reference of an admitted invocation. */
export function encodeToolOperationRef(
  parts: ToolOperationParts,
): Outcome<ToolOperationRef, ToolReferenceRejection> {
  const field = 'ToolOperationRef' as const
  const tenant = canonicalTenant(field, parts.tenant)
  if ('failure' in tenant) return tenant
  const call = identityText(field, decodeToolCallId, parts.call)
  if ('failure' in call) return call
  const admission = identityText(field, decodeToolOperationId, parts.admission)
  if ('failure' in admission) return admission
  const operation = identityText(field, decodeToolOperationId, parts.operation)
  if ('failure' in operation) return operation
  const text = JSON.stringify([
    'tool-operation',
    VERSION,
    tenant.ok,
    call.ok,
    admission.ok,
    operation.ok,
  ])
  return succeed(text as ToolOperationRef)
}

type Decoded =
  | Readonly<{ operation: null; tenant: TenantId; call: ToolCallId; admission: ToolOperationId }>
  | Readonly<{
      operation: ToolOperationId
      tenant: TenantId
      call: ToolCallId
      admission: ToolOperationId
    }>

function decodeElements(
  field: RefKind,
  marker: 'tool-invocation' | 'tool-operation',
  count: 5 | 6,
  text: unknown,
): Outcome<Decoded, ToolReferenceRejection> {
  if (typeof text !== 'string') return rejected(field, 'type')
  if (text.length > TOOL_REFERENCE_MAX_LENGTH) return rejected(field, 'length')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return rejected(field, 'type')
  }
  if (!Array.isArray(value)) return rejected(field, 'type')
  if (value[0] !== marker) return rejected(field, 'type')
  if (value[1] !== VERSION) return rejected(field, 'version')
  if (value.length !== count) return rejected(field, 'shape')
  const tenant = tenantCodec.parse(value[2])
  if (!tenant.ok) return rejected(field, 'shape')
  const call = decodeToolCallId(value[3])
  if ('failure' in call) return rejected(field, 'shape')
  const admission = decodeToolOperationId(value[4])
  if ('failure' in admission) return rejected(field, 'shape')
  if (count === 5)
    return succeed({
      operation: null,
      tenant: tenant.value,
      call: call.ok,
      admission: admission.ok,
    })
  const operation = decodeToolOperationId(value[5])
  if ('failure' in operation) return rejected(field, 'shape')
  return succeed({
    operation: operation.ok,
    tenant: tenant.value,
    call: call.ok,
    admission: admission.ok,
  })
}

/**
 * Decodes a saved invocation reference text. The answer is the canonical text: a non-canonical
 * spacing of the same structure decodes to the same branded value. The decode is structural only;
 * it does not prove that the call exists or that the caller may use it.
 */
export function decodeToolInvocationRef(
  text: unknown,
): Outcome<ToolInvocationRef, ToolReferenceRejection> {
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 5, text)
  if ('failure' in decoded) return decoded
  return encodeToolInvocationRef(decoded.ok)
}

/** Decodes a saved operation reference text. */
export function decodeToolOperationRef(
  text: unknown,
): Outcome<ToolOperationRef, ToolReferenceRejection> {
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 6, text)
  if ('failure' in decoded) return decoded
  if (decoded.ok.operation === null) return rejected('ToolOperationRef', 'shape')
  const { tenant, call, admission, operation } = decoded.ok
  return encodeToolOperationRef({ tenant, call, admission, operation })
}

/** The parts a branded invocation reference carries. Only the codec can mint the brand. */
export function readToolInvocationRef(reference: ToolInvocationRef): ToolInvocationParts {
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 5, reference)
  if ('failure' in decoded)
    throw new TypeError(`a branded invocation reference does not decode: ${reference}`)
  const { tenant, call, admission } = decoded.ok
  return { tenant, call, admission }
}

/** The parts a branded operation reference carries. */
export function readToolOperationRef(reference: ToolOperationRef): ToolOperationParts {
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 6, reference)
  if ('failure' in decoded || decoded.ok.operation === null)
    throw new TypeError(`a branded operation reference does not decode: ${reference}`)
  const { tenant, call, admission, operation } = decoded.ok
  return { tenant, call, admission, operation }
}

function resolve<R, P extends ToolInvocationParts>(
  reference: unknown,
  tenant: TenantId,
  decode: (text: unknown) => Outcome<R, ToolReferenceRejection>,
  read: (encoded: R) => P,
): Outcome<P, ToolReferenceFailure> {
  const decoded = decode(reference)
  if ('failure' in decoded) return fail({ kind: 'malformed', rejection: decoded.failure })
  const parts = read(decoded.ok)
  return tenantEquals(parts.tenant, tenant) ? succeed(parts) : fail({ kind: 'foreign-tenant' })
}

/**
 * Resolves an untrusted invocation reference against the presented tenant: the decode, and then
 * the tenant comparison of legal-identity. `foreign-tenant` is a well-formed reference of another
 * tenant; it says nothing about whether the call exists.
 */
export function resolveToolInvocationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ToolInvocationParts, ToolReferenceFailure> {
  return resolve(reference, tenant, decodeToolInvocationRef, readToolInvocationRef)
}

/** Resolves an untrusted operation reference against the presented tenant. */
export function resolveToolOperationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ToolOperationParts, ToolReferenceFailure> {
  return resolve(reference, tenant, decodeToolOperationRef, readToolOperationRef)
}
