import type { CredentialRef } from '@omne-harness-lite/asset-model'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseScopeLayerIdentity,
  parseTenantId,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import {
  judgeModelProfileDocument,
  type ModelProfile,
  type ModelProfileRef,
} from '@omne-harness-lite/model-profile'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { narrow, StorageDefect, type ReadTx } from '@omne-harness-lite/storage'
import type { CatalogScope, CredentialBinding, ProfileRow } from './types.ts'

export interface ScopeKey {
  scope_layer: string
  organization_id: string
  account_id: string
}
export interface ProfileRecord extends ScopeKey {
  route_name: string
  profile_json: string
}
export interface DirectoryDb {
  model_profile: ProfileRecord
  model_profile_configuration: ScopeKey & {
    route_name: string
    revision: string
    values_json: string
  }
  model_manifest_state: { id: number; ordinal_json: string; dispositions_json: string }
  model_credential_binding: {
    organization_id: string
    account_id: string
    credential_ref: string
    bound_at: string
  }
}
export const db = (tx: ReadTx) => narrow<DirectoryDb>(tx)
export function scopeKey(scope: CatalogScope): ScopeKey {
  if (scope.layer === 'factory')
    return { scope_layer: 'factory', organization_id: '', account_id: '' }
  if (scope.layer === 'organization')
    return { scope_layer: 'organization', organization_id: scope.organization, account_id: '' }
  return {
    scope_layer: 'tenant',
    organization_id: scope.tenant.organization,
    account_id: scope.tenant.account,
  }
}
export const bindingKey = (tenant: TenantId) => ({
  organization_id: tenant.organization,
  account_id: tenant.account,
})
export function isCredentialRef(value: unknown): value is CredentialRef {
  return 'ok' in parseOpaqueIdentifier(value, 'CredentialRef')
}
export function isProfile(value: unknown): value is ModelProfile {
  return 'ok' in judgeModelProfileDocument('ModelProfile', value)
}
export function decodeProfile(row: ProfileRecord): ProfileRow {
  const parsed = readJsonStrict(row.profile_json)
  if ('failed' in parsed || !isProfile(parsed.ok) || parsed.ok.routeName !== row.route_name)
    throw new StorageDefect('stored model profile is malformed')
  const profile = parsed.ok
  if (row.scope_layer === 'factory') {
    if (profile.origin !== 'official' || row.organization_id !== '' || row.account_id !== '')
      throw new StorageDefect('stored profile scope is malformed')
    return { ref: { origin: 'official', routeName: row.route_name }, profile }
  }
  const scope = parseScopeLayerIdentity(
    row.scope_layer === 'organization'
      ? { layer: 'organization', organization: row.organization_id }
      : {
          layer: row.scope_layer,
          tenant: { organization: row.organization_id, account: row.account_id },
        },
  )
  if (
    !('ok' in scope) ||
    profile.origin !== 'custom' ||
    (scope.ok.layer === 'organization' && row.account_id !== '')
  )
    throw new StorageDefect('stored profile scope is malformed')
  return { ref: { origin: 'custom', scope: scope.ok, routeName: row.route_name }, profile }
}
export function rowKey(ref: ModelProfileRef): ScopeKey & { route_name: string } {
  return {
    ...scopeKey(ref.origin === 'official' ? { layer: 'factory' } : ref.scope),
    route_name: ref.routeName,
  }
}
export async function readRow(tx: ReadTx, ref: ModelProfileRef): Promise<ProfileRow | undefined> {
  const k = rowKey(ref)
  const row = await db(tx)
    .selectFrom('model_profile')
    .selectAll()
    .where('scope_layer', '=', k.scope_layer)
    .where('organization_id', '=', k.organization_id)
    .where('account_id', '=', k.account_id)
    .where('route_name', '=', k.route_name)
    .executeTakeFirst()
  return row === undefined ? undefined : decodeProfile(row)
}
export async function readBinding(
  tx: ReadTx,
  tenant: TenantId,
): Promise<CredentialBinding | undefined> {
  const row = await db(tx)
    .selectFrom('model_credential_binding')
    .selectAll()
    .where('organization_id', '=', tenant.organization)
    .where('account_id', '=', tenant.account)
    .executeTakeFirst()
  if (row === undefined) return undefined
  const time = instantFromRfc3339(row.bound_at)
  if (!isCredentialRef(row.credential_ref) || !('ok' in time))
    throw new StorageDefect('stored credential binding is malformed')
  return { credentialRef: row.credential_ref, boundAt: time.ok }
}
export async function putRow(tx: ReadTx, row: ProfileRow): Promise<void> {
  const k = rowKey(row.ref)
  await db(tx)
    .updateTable('model_profile')
    .set({ profile_json: writeJsonLossless(row.profile) })
    .where('scope_layer', '=', k.scope_layer)
    .where('organization_id', '=', k.organization_id)
    .where('account_id', '=', k.account_id)
    .where('route_name', '=', k.route_name)
    .execute()
}
export function checkedTenant(input: unknown): TenantId {
  const parsed = parseTenantId(input)
  if (!('ok' in parsed)) throw new StorageDefect('internal tenant is malformed')
  return parsed.ok
}
