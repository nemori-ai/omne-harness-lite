// Runtime values of the chapter "凭据引用与解析端口": the rule that fixes the layer of a supplier's
// credential, and the rule that reads the fixed layer. Every credential provider, the scripted
// double and the conformance suite apply these two functions, so the rule has one implementation.
// This file imports types only from the chapter files, so the type imports between chapters never
// see runtime code.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CredentialFailure, CredentialItemState } from './credential.ts'
import type { CredentialLayer } from './root.ts'

/** The state of every declared credential item in one layer, by item. */
export type CredentialLayerReading = ReadonlyMap<string, CredentialItemState>

/**
 * Whether a layer can serve: every declared item active. A revoked item wins over an unreadable
 * one, an unreadable one over a missing one; a layer with no item bound at all is `missing`.
 */
export function readCredentialLayer(
  items: readonly string[],
  reading: CredentialLayerReading,
): Outcome<undefined, CredentialFailure> {
  const states = items.map(item => reading.get(item) ?? 'unbound')
  if (states.includes('revoked')) return fail({ kind: 'revoked' })
  if (states.includes('unreadable')) return fail({ kind: 'unreadable' })
  const missing = items.filter((_, index) => states[index] === 'unbound')
  if (missing.length === items.length) return fail({ kind: 'missing' })
  if (missing.length > 0) return fail({ kind: 'incomplete', missing })
  return succeed(undefined)
}

/** Whether any declared item of the layer has a binding, whatever its life. */
function holdsAny(items: readonly string[], reading: CredentialLayerReading): boolean {
  return items.some(item => (reading.get(item) ?? 'unbound') !== 'unbound')
}

/**
 * Fixes the layer of a supplier's credential. A provider without credential items needs none. A
 * tenant layer that holds any item is the layer, whole or failing: it never falls back to the
 * official one. Only without any tenant item, and only for an official profile of a provider the
 * release holds, is the official layer the layer. Items of two layers are never mixed.
 */
export function selectCredentialLayer(
  input: Readonly<{
    items: readonly string[]
    tenant: CredentialLayerReading
    /** The official layer, or `null` when the release does not hold the provider. */
    official: CredentialLayerReading | null
    /** The profile is an official profile. */
    profileOfficial: boolean
  }>,
): Outcome<CredentialLayer, CredentialFailure> {
  const { items } = input
  if (items.length === 0) return succeed({ layer: 'none' })
  if (holdsAny(items, input.tenant)) {
    const read = readCredentialLayer(items, input.tenant)
    return 'ok' in read ? succeed({ layer: 'tenant' }) : read
  }
  if (!input.profileOfficial || input.official === null) return fail({ kind: 'missing' })
  const read = readCredentialLayer(items, input.official)
  return 'ok' in read ? succeed({ layer: 'official' }) : read
}
