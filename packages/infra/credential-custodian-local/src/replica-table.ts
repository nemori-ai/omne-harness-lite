import type { ColumnType } from 'kysely'
import { isOk, parseLoginStateId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { instantFromEpochMs } from '@omne-harness-lite/offer-expiry'
import { narrow, StorageDefect, type StorageUnit } from '@omne-harness-lite/storage'
import type { TenantId } from '@omne-harness-lite/identity-values'

export interface ReplicaTables {
  credential_custodian_replica: {
    tenant_organization: string
    tenant_account: string
    login_state: string
    stored_at: ColumnType<number | string | bigint, number, number>
    sealed_body: Uint8Array
    source_ref: string | null
  }
}

/** Unknown storage values are checked before any source comparison or decryption. */
export function checkedReplica(row: unknown): { sealedBody: Uint8Array; sourceRef: string | null } {
  if (
    row === null ||
    typeof row !== 'object' ||
    !('login_state' in row) ||
    !isOk(parseLoginStateId(row.login_state)) ||
    !('stored_at' in row) ||
    !('sealed_body' in row) ||
    !('source_ref' in row)
  )
    throw new StorageDefect('model replica row invalid')
  const rawTime = row.stored_at
  const time =
    typeof rawTime === 'number'
      ? rawTime
      : typeof rawTime === 'string' && /^-?\d+(?![\s\S])/u.test(rawTime)
        ? Number(rawTime)
        : typeof rawTime === 'bigint'
          ? Number(rawTime)
          : undefined
  if (
    !isOk(instantFromEpochMs(time)) ||
    !(row.sealed_body instanceof Uint8Array) ||
    row.sealed_body.byteLength === 0 ||
    (row.source_ref !== null && !isOk(parseOpaqueIdentifier(row.source_ref, 'CredentialRef')))
  )
    throw new StorageDefect('model replica row invalid')
  if (typeof row.source_ref !== 'string' && row.source_ref !== null)
    throw new StorageDefect('model replica row invalid')
  return { sealedBody: row.sealed_body, sourceRef: row.source_ref }
}

export async function readReplicaRowIn(unit: StorageUnit, tenant: TenantId) {
  return unit.query(async tx => {
    const row = await narrow<ReplicaTables>(tx)
      .selectFrom('credential_custodian_replica')
      .select(['login_state', 'stored_at', 'sealed_body', 'source_ref'])
      .where('tenant_organization', '=', tenant.organization)
      .where('tenant_account', '=', tenant.account)
      .executeTakeFirst()
    return row === undefined ? undefined : checkedReplica(row)
  })
}
