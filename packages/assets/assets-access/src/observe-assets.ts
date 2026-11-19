import { createChangeObservation, type FrameSource } from '@omne-harness/access-cordis-contract'
import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ChangesPort, TargetTenantPrincipals } from './ports.ts'

type ObserveAssets = AssetsProtocol['observations']['observe-assets']

function tenantTextOf(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('assets-access: tenant is not a minted TenantId')
  return text.value
}

export function createAssetsObservation(input: {
  principals: TargetTenantPrincipals
  changes: () => ChangesPort | undefined
}): FrameSource<ObserveAssets> {
  return createChangeObservation<ObserveAssets>({
    async admits(login, open) {
      const issued = await input.principals.actingFor(login, tenantTextOf(open.tenant))
      if ('ok' in issued) return 'admitted'
      return issued.refused === 'denied' ? 'denied' : 'basis-unavailable'
    },
    subscribe: (open, listener) => input.changes()?.subscribe(tenantTextOf(open.tenant), listener),
    frame: { kind: 'changed' },
  })
}
