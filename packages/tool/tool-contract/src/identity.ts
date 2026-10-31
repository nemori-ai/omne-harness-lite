// Branded Tool identities, adoption and evidence references, and access inputs.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access } from '@omne-harness/legal-identity'

declare const toolIdentity: unique symbol
export type ToolIdentity<K extends string> = string & { readonly [toolIdentity]: K }
export type ToolCallId = ToolIdentity<'ToolCallId'>
export type ToolOperationId = ToolIdentity<'ToolOperationId'>
export type ToolInstanceId = ToolIdentity<'ToolInstanceId'>
export type ToolWaitId = ToolIdentity<'ToolWaitId'>
export type ToolResultVersion = ToolIdentity<'ToolResultVersion'>
export type ToolDeliveryId = ToolIdentity<'ToolDeliveryId'>
export type ToolCursor = ToolIdentity<'ToolCursor'>
export type ToolRevision = ToolIdentity<'ToolRevision'>
// The three exchange values have one definition in exchange-refs and `Access` has one in
// legal-identity. The structure judgments stay in value-shapes.ts and judge-release.ts.
export type { Adoption, ConsumerRef, DurableEvidence } from '@omne-harness/exchange-refs'
export type { Access } from '@omne-harness/legal-identity'
export type CallAccess<P> = Access<P> & Readonly<{ call: ToolCallId }>
export type Mutation<P> = CallAccess<P> & Readonly<{ operation: ToolOperationId }>

/** Why a text is not a Tool identity. `field` names the identity type that the caller asked for. */
export type ToolIdentityRejection<K extends string> = Readonly<{
  field: K
  reason: 'type' | 'empty' | 'length' | 'character'
}>

/** The longest identity text, in UTF-16 code units. */
export const TOOL_IDENTITY_MAX_LENGTH = 256

// Printable ASCII without space. Tool mints its own identities inside this lexicon.
const IDENTITY_TEXT = /^[\x21-\x7e]+$/u

function decodeIdentity<K extends string>(
  kind: K,
  text: unknown,
): Outcome<ToolIdentity<K>, ToolIdentityRejection<K>> {
  if (typeof text !== 'string') return fail({ field: kind, reason: 'type' })
  if (text.length === 0) return fail({ field: kind, reason: 'empty' })
  if (text.length > TOOL_IDENTITY_MAX_LENGTH) return fail({ field: kind, reason: 'length' })
  if (!IDENTITY_TEXT.test(text)) return fail({ field: kind, reason: 'character' })
  // The checks above are the only way to mint the brand. A brand has no runtime value to build.
  return succeed(text as ToolIdentity<K>)
}

/**
 * Decodes the call text of a Tool producer, for example the producer reference that a consumer keeps.
 * The result is a branded identity only. It does not prove that the call exists or that the
 * caller may use it.
 */
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
