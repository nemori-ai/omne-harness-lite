import { narrow, StorageDefect, type ReadTx } from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SessionTenancyDb } from './reader.ts'
import { decodeTenant, sessionValue } from './values.ts'

/** Restricted owner input. This read does not acquire a transaction or grant tenant access. */
export async function readSessionCatalogIn(tx: ReadTx): Promise<readonly SessionScope[]> {
  const rows = await narrow<SessionTenancyDb>(tx)
    .selectFrom('session_tenancy')
    .select(['session', 'tenant'])
    .orderBy('session')
    .execute()
  const seen = new Set<string>()
  return Object.freeze(
    rows.map(row => {
      const session = sessionValue(row.session)
      if (session === undefined || seen.has(session))
        throw new StorageDefect('session catalog contains an invalid or repeated session')
      seen.add(session)
      return Object.freeze({ session, tenant: Object.freeze(decodeTenant(row.tenant)) })
    }),
  )
}
