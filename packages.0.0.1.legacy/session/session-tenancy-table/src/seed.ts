import { narrow, UniqueViolation, type WriteTx } from '@omne-harness-lite/storage'
import { parseTenantId, tenantIdEquals } from '@omne-harness-lite/identity-values'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { sessionValue, decodeTenant } from './values.ts'
import type { SessionTenancyDb } from './reader.ts'

/** Restricted development acceptance input, never a Cordis service or root export. */
export async function seedHoldingTenant(
  tx: WriteTx,
  value: unknown,
  tenantValue: unknown,
): Promise<'created' | 'alreadyPresent'> {
  const session = sessionValue(value)
  const tenant = parseTenantId(tenantValue)
  if (session === undefined || !('ok' in tenant))
    throw new TypeError('invalid session tenancy seed input')
  await tx.lockRow('session_tenancy', { session })
  const db = narrow<SessionTenancyDb>(tx)
  const old = await db
    .selectFrom('session_tenancy')
    .select('tenant')
    .where('session', '=', session)
    .executeTakeFirst()
  if (old !== undefined) {
    if (tenantIdEquals(decodeTenant(old.tenant), tenant.ok)) return 'alreadyPresent'
    throw new UniqueViolation('session_tenancy_pkey')
  }
  await db
    .insertInto('session_tenancy')
    .values({ session, tenant: writeJsonLossless(tenant.ok) })
    .execute()
  return 'created'
}
