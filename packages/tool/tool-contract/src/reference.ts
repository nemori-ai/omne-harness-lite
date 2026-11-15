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

export type ToolReferenceRejection = Readonly<{
  field: 'ToolInvocationRef' | 'ToolOperationRef'
  reason: 'type' | 'version' | 'shape' | 'length'
}>

export type ToolReferenceFailure =
  | Readonly<{ kind: 'malformed'; rejection: ToolReferenceRejection }>
  | Readonly<{ kind: 'invalid-tenant' }>

export type ToolInvocationParts = Readonly<{
  tenant: TenantId
  call: ToolCallId
  admission: ToolOperationId
}>
export type ToolOperationParts = ToolInvocationParts & Readonly<{ operation: ToolOperationId }>
export type ToolInvocationLocation = Omit<ToolInvocationParts, 'tenant'>
export type ToolOperationLocation = Omit<ToolOperationParts, 'tenant'>

export const TOOL_REFERENCE_MAX_LENGTH = 1565

const VERSION = 2

type RefKind = ToolReferenceRejection['field']

function rejected<K extends RefKind>(
  field: K,
  reason: ToolReferenceRejection['reason'],
): Outcome<never, ToolReferenceRejection> {
  return fail({ field, reason })
}

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

export function decodeToolInvocationRef(
  text: unknown,
): Outcome<ToolInvocationRef, ToolReferenceRejection> {
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 4, text)
  return 'failure' in decoded ? decoded : succeed(invocationText(decoded.ok))
}

export function decodeToolOperationRef(
  text: unknown,
): Outcome<ToolOperationRef, ToolReferenceRejection> {
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 5, text)
  if ('failure' in decoded) return decoded
  const { call, admission, operation } = decoded.ok
  if (operation === null) return rejected('ToolOperationRef', 'shape')
  return succeed(operationText({ call, admission, operation }))
}

export function readToolInvocationRef(reference: ToolInvocationRef): ToolInvocationLocation {
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 4, reference)
  if ('failure' in decoded)
    throw new TypeError(`a branded invocation reference does not decode: ${reference}`)
  const { call, admission } = decoded.ok
  return { call, admission }
}

export function readToolOperationRef(reference: ToolOperationRef): ToolOperationLocation {
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 5, reference)
  if ('failure' in decoded || decoded.ok.operation === null)
    throw new TypeError(`a branded operation reference does not decode: ${reference}`)
  const { call, admission, operation } = decoded.ok
  return { call, admission, operation }
}

export function resolveToolInvocationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ToolInvocationParts, ToolReferenceFailure> {
  if (!tenantCodec.encode(tenant).ok) return fail({ kind: 'invalid-tenant' })
  const decoded = decodeElements('ToolInvocationRef', 'tool-invocation', 4, reference)
  if ('failure' in decoded) return fail({ kind: 'malformed', rejection: decoded.failure })
  const { call, admission } = decoded.ok
  return succeed({ tenant, call, admission })
}

export function resolveToolOperationRef(
  reference: unknown,
  tenant: TenantId,
): Outcome<ToolOperationParts, ToolReferenceFailure> {
  if (!tenantCodec.encode(tenant).ok) return fail({ kind: 'invalid-tenant' })
  const decoded = decodeElements('ToolOperationRef', 'tool-operation', 5, reference)
  if ('failure' in decoded) return fail({ kind: 'malformed', rejection: decoded.failure })
  const { call, admission, operation } = decoded.ok
  if (operation === null)
    return fail({ kind: 'malformed', rejection: { field: 'ToolOperationRef', reason: 'shape' } })
  return succeed({ tenant, call, admission, operation })
}

export const toolStreamCallCodec: StreamCallCodec = Object.freeze({
  producer: 'tool',
  resolve: ({ text, tenant }) => {
    const resolved = resolveToolInvocationRef(text, tenant)
    if ('failure' in resolved)
      return fail(
        resolved.failure.kind === 'malformed' ? { kind: 'malformed' } : { kind: 'invalid-tenant' },
      )
    const canonical = encodeToolInvocationRef(resolved.ok)
    return 'failure' in canonical ? fail({ kind: 'malformed' }) : succeed(canonical.ok)
  },
})
