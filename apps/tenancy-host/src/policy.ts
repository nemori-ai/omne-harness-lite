import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type {
  JsonValue,
  PluginRow,
  PreparedPluginTree,
} from '@omne-harness-lite/cordis-plugin-tree'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import {
  ACCOUNTS_SERVICE,
  LOGINS_SERVICE,
  CREDENTIALS_SERVICE,
} from '@omne-harness-lite/account-identity/cordis'
import {
  ORGANIZATIONS_SERVICE,
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATION_PURGE_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import { REGISTRATION_SERVICE } from '@omne-harness-lite/account-registration/cordis'

export type HostPluginRole =
  | 'storage'
  | 'clock'
  | 'credentials'
  | 'accounts'
  | 'organizations'
  | 'registration'
  | 'ops'
  | 'entry'
export type HostPluginPolicyCode =
  | 'missing-role'
  | 'duplicate-role'
  | 'unsupported-role-version'
  | 'role-service-mismatch'
  | 'incompatible-role-config'
  | 'unknown-role'
export class HostPluginPolicyError extends Error {
  override readonly name = 'HostPluginPolicyError'
  constructor(
    readonly code: HostPluginPolicyCode,
    readonly role?: HostPluginRole,
  ) {
    super('Plugin tree rejected')
  }
}

const required: Record<HostPluginRole, readonly string[]> = {
  storage: [STORAGE_SERVICE],
  clock: [CLOCK_SERVICE],
  credentials: [CREDENTIALS_SERVICE],
  accounts: [ACCOUNTS_SERVICE, LOGINS_SERVICE],
  organizations: [
    ORGANIZATIONS_SERVICE,
    MEMBERSHIPS_SERVICE,
    OFFERS_SERVICE,
    ORGANIZATION_PURGE_SERVICE,
  ],
  registration: [REGISTRATION_SERVICE],
  ops: [],
  entry: [],
}
const distributionIds: Record<HostPluginRole, string> = {
  storage: 'storage-sql',
  clock: 'clock-lease',
  credentials: 'credential-verification',
  accounts: 'account-identity',
  organizations: 'organization-governance',
  registration: 'account-registration',
  ops: 'governance-center-ops',
  entry: 'governance-center-entry',
}
export function isHostPluginRole(value: unknown): value is HostPluginRole {
  return typeof value === 'string' && Object.hasOwn(required, value)
}
export function isHostPluginPolicyCode(value: unknown): value is HostPluginPolicyCode {
  return (
    typeof value === 'string' &&
    [
      'missing-role',
      'duplicate-role',
      'unsupported-role-version',
      'role-service-mismatch',
      'incompatible-role-config',
      'unknown-role',
    ].includes(value)
  )
}
const parameter = z.number().int().positive()
// This checks the shared projection shape. Algorithm parameter validity belongs to the provider's Config.
const credentialsProjection = z
  .object({
    cost: parameter,
    blockSize: parameter,
    parallelization: parameter,
    saltBytes: parameter,
    keyBytes: parameter,
  })
  .strict()

/** Return role -> row id only after every host obligation has been checked. */
export function checkHostPolicy(
  prepared: PreparedPluginTree,
  distribution: readonly PluginRow[],
): ReadonlyMap<HostPluginRole, string> {
  const roles = new Map<
    HostPluginRole,
    { id: string; config: JsonValue; provides: readonly string[] }
  >()
  for (const row of prepared.declarations)
    for (const claim of row.declaration.claims) {
      if (!claim.name.startsWith('tenancy-host/')) continue
      const role = claim.name.slice('tenancy-host/'.length)
      if (!isHostPluginRole(role)) throw new HostPluginPolicyError('unknown-role')
      if (roles.has(role)) throw new HostPluginPolicyError('duplicate-role', role)
      if (claim.version !== (role === 'clock' ? 2 : 1))
        throw new HostPluginPolicyError('unsupported-role-version', role)
      roles.set(role, { id: row.id, config: claim.config, provides: row.declaration.provides })
    }
  for (const role of Object.keys(required)) {
    if (!isHostPluginRole(role)) continue
    const row = roles.get(role)
    if (row === undefined) throw new HostPluginPolicyError('missing-role', role)
    if (required[role].some(key => !row.provides.includes(key)))
      throw new HostPluginPolicyError('role-service-mismatch', role)
    const expected = distribution.find(item => item.id === distributionIds[role])
    if (expected === undefined) throw new Error('Host distribution is incomplete')
    if (
      role === 'credentials'
        ? !credentialsProjection.safeParse(row.config).success
        : !isDeepStrictEqual(row.config, expected.config)
    )
      throw new HostPluginPolicyError('incompatible-role-config', role)
  }
  return new Map([...roles].map(([role, row]) => [role, row.id]))
}
