import {
  tenantIdEquals,
  type MembershipStandingResult,
  type ScopeLayerIdentity,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import type { ProfileOrigin } from '@omne-harness-lite/model-profile'
import { contentEqual, jsonEqual } from './equality.ts'
import type {
  CatalogScope,
  CredentialBinding,
  CredentialPresent,
  ManifestEntryDisposition,
  ManifestResult,
  OfficialManifest,
  ProfileRow,
} from './types.ts'

export function scopeChain(
  tenant: TenantId,
): readonly [ScopeLayerIdentity, ScopeLayerIdentity, { readonly layer: 'factory' }] {
  return [
    { layer: 'tenant', tenant },
    { layer: 'organization', organization: tenant.organization },
    { layer: 'factory' },
  ]
}
export function scopeMatches(a: CatalogScope, b: CatalogScope): boolean {
  if (a.layer !== b.layer) return false
  if (a.layer === 'factory') return true
  if (a.layer === 'organization' && b.layer === 'organization')
    return a.organization === b.organization
  return a.layer === 'tenant' && b.layer === 'tenant' && tenantIdEquals(a.tenant, b.tenant)
}
export function sameWriter(initiator: TenantId, scope: ScopeLayerIdentity): boolean {
  return scope.layer === 'organization'
    ? initiator.organization === scope.organization
    : tenantIdEquals(initiator, scope.tenant)
}
export function configEligibility(
  initiator: TenantId,
  scope: ScopeLayerIdentity,
  standing: MembershipStandingResult,
): 'eligible' | 'notAuthorized' | 'unavailable' {
  if (!sameWriter(initiator, scope)) return 'notAuthorized'
  if ('failure' in standing) return 'unavailable'
  if (
    standing.standing !== 'effective' ||
    (scope.layer === 'organization' && standing.role !== 'superAdministrator')
  )
    return 'notAuthorized'
  return 'eligible'
}
function rank(row: ProfileRow): number {
  return row.ref.origin === 'official' ? 0 : row.ref.scope.layer === 'organization' ? 1 : 2
}
export function winningRow(
  rows: readonly ProfileRow[],
  routeName: string,
  allowed: ReadonlySet<string> | readonly string[],
): ProfileRow | undefined {
  const has = Array.isArray(allowed) ? allowed.includes(routeName) : new Set(allowed).has(routeName)
  if (!has) return undefined
  return rows
    .filter(row => row.profile.routeName === routeName && row.profile.registration === 'listed')
    .reduce<ProfileRow | undefined>(
      (winner, row) => (winner === undefined || rank(row) > rank(winner) ? row : winner),
      undefined,
    )
}
export interface SlotBinding extends CredentialBinding {
  readonly tenant: TenantId
}
export function credentialSlot(
  binding: SlotBinding | undefined,
  origin: ProfileOrigin,
  factoryConfigured: boolean,
): CredentialPresent {
  return binding === undefined
    ? origin === 'official' && factoryConfigured
      ? { present: true, scope: { layer: 'factory' } }
      : { present: false }
    : {
        present: true,
        scope: { layer: 'tenant', tenant: binding.tenant },
        boundAt: binding.boundAt,
      }
}
export interface LoadedManifest extends ManifestResult {
  readonly rows: readonly ProfileRow[]
}
export function manifestDisposition(
  loaded: LoadedManifest,
  manifest: OfficialManifest,
): ManifestResult | { readonly failure: 'manifestNotNewer' } {
  const listed = loaded.rows.filter(row => row.profile.registration === 'listed')
  const same =
    listed.length === manifest.entries.length &&
    manifest.entries.every(entry => listed.some(row => contentEqual(row.profile, entry)))
  if (jsonEqual(loaded.ordinal, manifest.ordinal))
    return same
      ? { ordinal: loaded.ordinal, dispositions: loaded.dispositions }
      : { failure: 'manifestNotNewer' }
  // Positive integral decimal ordinals are compared without rounding or expansion.
  const left = integerParts(loaded.ordinal),
    right = integerParts(manifest.ordinal)
  if (
    left.width > right.width ||
    (left.width === right.width &&
      left.digits.padEnd(Math.max(left.digits.length, right.digits.length), '0') >=
        right.digits.padEnd(Math.max(left.digits.length, right.digits.length), '0'))
  )
    return { failure: 'manifestNotNewer' }
  const dispositions: ManifestEntryDisposition[] = manifest.entries.map(entry => {
    const old = loaded.rows.find(row => row.profile.routeName === entry.routeName)
    return {
      ref: { origin: 'official', routeName: entry.routeName },
      disposition:
        old === undefined
          ? 'added'
          : old.profile.registration === 'withdrawn'
            ? 'relisted'
            : contentEqual(old.profile, entry)
              ? 'unchanged'
              : 'updated',
    }
  })
  for (const row of listed)
    if (!manifest.entries.some(e => e.routeName === row.profile.routeName))
      dispositions.push({ ref: row.ref, disposition: 'withdrawn' })
  return { ordinal: manifest.ordinal, dispositions }
}
import { jsonNumberSource } from '@omne-harness-lite/content-blocks'
function integerParts(value: OfficialManifest['ordinal']): { digits: string; width: bigint } {
  const [mantissa = '', exp = '0'] = jsonNumberSource(value).split(/[eE]/u)
  const digits = mantissa.replace('.', '').replace(/^0+/u, '') || '0'
  return {
    digits,
    width: BigInt(digits.length) + BigInt(exp) - BigInt(mantissa.split('.')[1]?.length ?? 0),
  }
}
