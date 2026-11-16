import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CredentialFailure, CredentialItemState } from './credential.ts'
import type { CredentialLayer } from './root.ts'

export type CredentialLayerReading = ReadonlyMap<string, CredentialItemState>

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

function holdsAny(items: readonly string[], reading: CredentialLayerReading): boolean {
  return items.some(item => (reading.get(item) ?? 'unbound') !== 'unbound')
}

export function selectCredentialLayer(
  input: Readonly<{
    items: readonly string[]
    tenant: CredentialLayerReading
    official: CredentialLayerReading | null
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
