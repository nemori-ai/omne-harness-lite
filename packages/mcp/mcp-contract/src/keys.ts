import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AdoptedEndpoint } from './ports.ts'
import type { CredentialBinding } from './brands.ts'
import type { AuthKind, CatalogKey, ConnectionKey, PeerAccount } from './values.ts'

export function peerAccountOf(
  auth: AuthKind,
  binding: CredentialBinding | undefined,
): Outcome<PeerAccount, 'credential-missing'> {
  if (auth === 'none') return succeed({ kind: 'anonymous' })
  if (binding === undefined) return fail('credential-missing')
  return succeed({ kind: 'credential', binding })
}

export function catalogKeyOf(
  tenant: TenantId,
  endpoint: AdoptedEndpoint,
  account: PeerAccount,
): CatalogKey {
  return { tenant, account, holding: endpoint.ref.holding }
}

export function connectionKeyOf(
  tenant: TenantId,
  endpoint: AdoptedEndpoint,
  account: PeerAccount,
): ConnectionKey {
  return { tenant, holding: endpoint.ref.holding, adoptionRevision: endpoint.revision, account }
}
