import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { StreamCallCodec } from '@omne-harness/stream-arrival'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
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
 * another kind. `version`: a version other than 2 (a version 1 text is refused, not read).
 * `shape`: the wrong element count, or an element that is not the identity it must be. `length`:
 * the text is longer than the longest encodable reference.
 */
export type ToolReferenceRejection = Readonly<{
  field: 'ToolInvocationRef' | 'ToolOperationRef'
  reason: 'type' | 'version' | 'shape' | 'length'
}>

/**
 * A malformed reference, or `foreign-tenant`: the presented tenant is not a tenant legal-identity
 * minted. Version 2 carries no tenant (R2-D357), so a minted tenant never gets `foreign-tenant`: a
 * reference of another tenant locates nothing in the caller's tenant partition, and the
 * store-backed entry answers it as it answers a call that does not exist.
 */
export type ToolReferenceFailure =
  | Readonly<{ kind: 'malformed'; rejection: ToolReferenceRejection }>
  | Readonly<{ kind: 'foreign-tenant' }>

export type ToolInvocationParts = Readonly<{
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
}>
export type ToolOperationParts = ToolInvocationParts & Readonly<{ operation: ToolOperationId }>
/** The identities a reference text carries. The tenant of a use comes from the caller's Access. */
export type ToolInvocationLocation = Omit<ToolInvocationParts, 'tenant'>
export type ToolOperationLocation = Omit<ToolOperationParts, 'tenant'>

/**
 * The longest reference text, in UTF-16 code units. A Tool identity takes up to 256 characters,
 * and the worst JSON escaping doubles each: 514 with quotes. The operation form is then
 * `["tool-operation",2,` (20) + three identities with the two separators between them
 * (514 + 2 × 515) + `]`: 1565. The invocation form (marker one longer, no operation) is 1051. This limit does
 * not borrow the 256 of one Tool identity text. The text carries no tenant (R2-D357).
 */
export const TOOL_REFERENCE_MAX_LENGTH = 1565

/** The only reference version this codec reads or writes. Version 1 texts are refused. */
const VERSION = 2

type RefKind = ToolReferenceRejection['field']

function rejected<K extends RefKind>(
  field: K,
  reason: ToolReferenceRejection['reason'],
): Outcome<never, ToolReferenceRejection> {
  return fail({ field, reason })
}

/** The tenant is not part of the text, but a reference is encoded only for a minted tenant. */
function mintedTenant(field: RefKind, tenant: TenantId): Outcome<true, ToolReferenceRejection> {
  return tenantCodec.encode(tenant).ok ? succeed(true) : rejected(field, 'type')
}

function identityText(
  field: RefKind,
  decode: (text: unknown) => Outcome<string, unknown>,
  text: string,
): Outcome<string, ToolReferenceRejection> {
  return 'ok' in decode(text) ? succeed(text) : rejected(field, 'type')
}

/** The canonical text of identities the decoders admitted. */
function invocationText(parts: ToolInvocationLocation): ToolInvocationRef {
  return JSON.stringify([
    'tool-invocation',
    VERSION,
    parts.call,
    parts.admission,
  ]) as ToolInvocationRef
}

function operationText(parts: ToolOperationLocation): ToolOperationRef {
  return JSON.stringify([
    'tool-operation',
    VERSION,
    parts.call,
    parts.admission,
    parts.operation,
  ]) as ToolOperationRef
}

/**
 * Encodes the invocation reference. It fails only when a part is not what its brand claims: the
 * tenant must be a legal-identity tenant and the identities must decode. The tenant is checked
 * but not written: the text carries the call and the admission only. The codec reads no store and
 * mints no identity.
 */
export function encodeToolInvocationRef(
  parts: ToolInvocationParts,
): Outcome<ToolInvocationRef, ToolReferenceRejection> {
  const field = 'ToolInvocationRef' as const
  const tenant = mintedTenant(field, parts.tenant)
  if ('failure' in tenant) return tenant
  const call = identityText(field, decodeToolCallId, parts.call)
  if ('failure' in call) return call
  const admission = identityText(field, decodeToolOperationId, parts.admission)
  if ('failure' in admission) return admission
  return succeed(
    invocationText({ call: call.ok as ToolCallId, admission: admission.ok as ToolOperationId }),
  )
}

/** Encodes the operation reference of an admitted invocation. */
export function encodeToolOperationRef(
  parts: ToolOperationParts,
): Outcome<ToolOperationRef, ToolReferenceRejection> {
  const field = 'ToolOperationRef' as const
  const tenant = mintedTenant(field, parts.tenant)
  if ('failure' in tenant) return tenant
  const call = identityText(field, decodeToolCallId, parts.call)
  if ('failure' in call) return call
  const admission = identityText(field, decodeToolOperationId, parts.admission)
  if ('failure' in admission) return admission
  const operation = identityText(field, decodeToolOperationId, parts.operation)
  if ('failure' in operation) return operation
  return succeed(
    operationText({
      call: call.ok as ToolCallId,
      admission: admission.ok as ToolOperationId,
      operation: operation.ok as ToolOperationId,
    }),
  )
}

type Decoded =
  | Readonly<{ operation: null; call: ToolCallId; admission: ToolOperationId }>
  | Readonly<{ operation: ToolOperationId; call: ToolCallId; admission: ToolOperationId }>

function decodeElements(
  field: RefKind,
  marker: 'tool-invocation' | 'tool-operation',
  count: 4 | 5,
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
  const call = decodeToolCallId(value[2])
  if ('failure' in call) return rejected(field, 'shape')
  const admission = decodeToolOperationId(value[3])
  if ('failure' in admission) return rejected(field, 'shape')
  if (count === 4) return succeed({ operation: null, call: call.ok, admission: admission.ok })
  const operation = decodeToolOperationId(value[4])
  if ('failure' in operation) return rejected(field, 'shape')
  return succeed({ operation: operation.ok, call: call.ok, admission: admission.ok })
}

/**
 * Decodes a saved invocation reference text. The answer is the canonical text: a non-canonical
 * spacing of the same structure decodes to the same branded value. The decode is structural only;
 * it does not prove that the call exists or that the caller may use it.
 */
export function decodeToolInvocationRef(
  text: unknown,
): Outcome<ToolInvocationRef, ToolReferenceRejection> {
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 4, text)
  return 'failure' in decoded ? decoded : succeed(invocationText(decoded.ok))
}

/** Decodes a saved operation reference text. */
export function decodeToolOperationRef(
  text: unknown,
): Outcome<ToolOperationRef, ToolReferenceRejection> {
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 5, text)
  if ('failure' in decoded) return decoded
  const { call, admission, operation } = decoded.ok
  if (operation === null) return rejected('ToolOperationRef', 'shape')
  return succeed(operationText({ call, admission, operation }))
}

/**
 * The identities a branded invocation reference carries. Only the codec can mint the brand. The
 * text has no tenant: the tenant of a use is the caller's (resolveToolInvocationRef).
 */
export function readToolInvocationRef(reference: ToolInvocationRef): ToolInvocationLocation {
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 4, reference)
  if ('failure' in decoded)
    throw new TypeError(`a branded invocation reference does not decode: ${reference}`)
  const { call, admission } = decoded.ok
  return { call, admission }
}

/** The identities a branded operation reference carries. */
export function readToolOperationRef(reference: ToolOperationRef): ToolOperationLocation {
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 5, reference)
  if ('failure' in decoded || decoded.ok.operation === null)
    throw new TypeError(`a branded operation reference does not decode: ${reference}`)
  const { call, admission, operation } = decoded.ok
  return { call, admission, operation }
}

/**
 * Resolves an untrusted invocation reference for the presented tenant: the tenant must be minted
 * by legal-identity (else `foreign-tenant`), then the text decodes. The text has no tenant of its
 * own (R2-D357), so a reference of another tenant resolves here to parts of the caller's tenant,
 * and the store-backed entry finds no such call: the same answer as for a call that never existed.
 * Success does not say the call exists in that tenant.
 */
export function resolveToolInvocationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ToolInvocationParts, ToolReferenceFailure> {
  if (!tenantCodec.encode(tenant).ok) return fail({ kind: 'foreign-tenant' })
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 4, reference)
  if ('failure' in decoded) return fail({ kind: 'malformed', rejection: decoded.failure })
  const { call, admission } = decoded.ok
  return succeed({ tenant, call, admission })
}

/** Resolves an untrusted operation reference for the presented tenant. */
export function resolveToolOperationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ToolOperationParts, ToolReferenceFailure> {
  if (!tenantCodec.encode(tenant).ok) return fail({ kind: 'foreign-tenant' })
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 5, reference)
  if ('failure' in decoded) return fail({ kind: 'malformed', rejection: decoded.failure })
  const { call, admission, operation } = decoded.ok
  if (operation === null)
    return fail({ kind: 'malformed', rejection: { field: 'ToolOperationRef', reason: 'shape' } })
  return succeed({ tenant, call, admission, operation })
}

/**
 * The producer `tool` adapter of the public stream reference (SPEC「公共流协议上的观察」): the
 * original call text of a Tool stream reference is a canonical invocation reference. The detailed
 * rejection of a malformed reference becomes the public `malformed`; `foreign-tenant` (an unminted
 * tenant) keeps its kind. The public layer checks the minted tenant before this adapter runs, so it
 * does not reach here. A reference of another tenant resolves (the text has no tenant) and the
 * observation finds no such call.
 */
export const toolStreamCallCodec: StreamCallCodec = Object.freeze({
  producer: 'tool',
  resolve: ({ text, tenant }) => {
    const resolved = resolveToolInvocationRef(text, tenant)
    if ('failure' in resolved)
      return fail(
        resolved.failure.kind === 'malformed' ? { kind: 'malformed' } : { kind: 'foreign-tenant' },
      )
    const canonical = encodeToolInvocationRef(resolved.ok)
    return 'failure' in canonical ? fail({ kind: 'malformed' }) : succeed(canonical.ok)
  },
})
