import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access } from '@omne-harness/legal-identity'

declare const toolIdentity: unique symbol
export type ToolIdentity<K extends string> = string & { readonly [toolIdentity]: K }
export type ToolBodyId = ToolIdentity<'ToolBodyId'>
export type ToolCallId = ToolIdentity<'ToolCallId'>
export type ToolOperationId = ToolIdentity<'ToolOperationId'>
export type ToolInstanceId = ToolIdentity<'ToolInstanceId'>
export type ToolWaitId = ToolIdentity<'ToolWaitId'>
export type ToolResultVersion = ToolIdentity<'ToolResultVersion'>
export type ToolDeliveryId = ToolIdentity<'ToolDeliveryId'>
export type ToolCursor = ToolIdentity<'ToolCursor'>
export type ToolRevision = ToolIdentity<'ToolRevision'>
export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'
export type { Access } from '@omne-harness/legal-identity'
export type CallAccess<P> = Access<P> & Readonly<{ call: ToolCallId }>
export type Mutation<P> = CallAccess<P> & Readonly<{ operation: ToolOperationId }>

export type ToolIdentityRejection<K extends string> = Readonly<{
  field: K
  reason: 'type' | 'empty' | 'length' | 'character'
}>

export const TOOL_IDENTITY_MAX_LENGTH = 256

const IDENTITY_TEXT = /^[\x21-\x7e]+$/u

function decodeIdentity<K extends string>(
  kind: K,
  text: unknown,
): Outcome<ToolIdentity<K>, ToolIdentityRejection<K>> {
  if (typeof text !== 'string') return fail({ field: kind, reason: 'type' })
  if (text.length === 0) return fail({ field: kind, reason: 'empty' })
  if (text.length > TOOL_IDENTITY_MAX_LENGTH) return fail({ field: kind, reason: 'length' })
  if (!IDENTITY_TEXT.test(text)) return fail({ field: kind, reason: 'character' })
  return succeed(text as ToolIdentity<K>)
}

export function decodeToolBodyId(
  text: unknown,
): Outcome<ToolBodyId, ToolIdentityRejection<'ToolBodyId'>> {
  return decodeIdentity('ToolBodyId', text)
}

export function decodeToolCallId(
  text: unknown,
): Outcome<ToolCallId, ToolIdentityRejection<'ToolCallId'>> {
  return decodeIdentity('ToolCallId', text)
}

export function decodeToolOperationId(
  text: unknown,
): Outcome<ToolOperationId, ToolIdentityRejection<'ToolOperationId'>> {
  return decodeIdentity('ToolOperationId', text)
}

export function decodeToolInstanceId(
  text: unknown,
): Outcome<ToolInstanceId, ToolIdentityRejection<'ToolInstanceId'>> {
  return decodeIdentity('ToolInstanceId', text)
}

export function decodeToolWaitId(
  text: unknown,
): Outcome<ToolWaitId, ToolIdentityRejection<'ToolWaitId'>> {
  return decodeIdentity('ToolWaitId', text)
}

export function decodeToolResultVersion(
  text: unknown,
): Outcome<ToolResultVersion, ToolIdentityRejection<'ToolResultVersion'>> {
  return decodeIdentity('ToolResultVersion', text)
}

export function decodeToolDeliveryId(
  text: unknown,
): Outcome<ToolDeliveryId, ToolIdentityRejection<'ToolDeliveryId'>> {
  return decodeIdentity('ToolDeliveryId', text)
}

export function decodeToolCursor(
  text: unknown,
): Outcome<ToolCursor, ToolIdentityRejection<'ToolCursor'>> {
  return decodeIdentity('ToolCursor', text)
}

export function decodeToolRevision(
  text: unknown,
): Outcome<ToolRevision, ToolIdentityRejection<'ToolRevision'>> {
  return decodeIdentity('ToolRevision', text)
}
