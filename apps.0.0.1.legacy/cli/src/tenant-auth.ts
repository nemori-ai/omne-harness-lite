import type { ClientLocalState } from '@omne-harness-lite/client-local-state'
import type { SessionIdentityObservation } from './session-preparation.ts'
import type { TenantLoginOutcome } from './tenant-login.ts'
import type { TenantPaths } from './state-layout.ts'
import { prepareTenantDirectory } from './state-layout.ts'
import { StateLayoutFailure } from './state-layout-values.ts'
import { validRunLoginBinding } from './session-preparation.ts'
import { isOk, parseTenantRole } from '@omne-harness-lite/identity-values'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { installTenantLogin } from './tenant-login.ts'

export type TenantAuthOutcome = { readonly paths: TenantPaths; readonly login: TenantLoginOutcome }
export async function prepareTenantAuth(
  home: string,
  source: ClientLocalState,
  identity: SessionIdentityObservation,
  operationId: string,
  replacement: 'empty-only' | 'replace-same-account',
): Promise<TenantAuthOutcome> {
  if (
    !validRunLoginBinding(identity) ||
    !isOk(parseTenantRole(identity.role)) ||
    identity.tenant.account !== identity.accountId
  )
    throw new StateLayoutFailure('invalid-binding')
  if (operationId.length === 0 || operationId.includes('\0'))
    throw new StateLayoutFailure('invalid-binding')
  const captured = structuredClone(identity)
  const paths = await prepareTenantDirectory(home, {
    formatVersion: 1,
    centerId: captured.centerId,
    tenant: captured.tenant,
  })
  const target = await openClientLocalState(
    { directory: paths.auth },
    {
      storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) },
    },
  )
  let result: TenantLoginOutcome
  try {
    result = await installTenantLogin(source, target, captured, operationId, replacement)
  } catch (error) {
    try {
      await target.close()
    } catch (failure) {
      throw new AggregateError([error, failure], 'omne-tenant-auth: installation and close failed')
    }
    throw error
  }
  await target.close()
  return { paths, login: result }
}
