// The peer account and the two keys. The peer account has one source: the authentication kind
// and the credential binding of the adoption.
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AdoptedEndpoint } from './ports.ts'
import type {
  AuthKind,
  CatalogKey,
  ConnectionKey,
  CredentialBinding,
  PeerAccount,
} from './values.ts'

/**
 * Without authentication the account is `anonymous` and the binding is not read. With
 * authentication a missing binding is `credential-missing`; no other credential is used.
 */
export function peerAccountOf(
  auth: AuthKind,
  binding: CredentialBinding | undefined,
): Outcome<PeerAccount, 'credential-missing'> {
  if (auth === 'none') return succeed({ kind: 'anonymous' })
  if (binding === undefined) return fail('credential-missing')
  return succeed({ kind: 'credential', binding })
}

/** The catalog key. It has no adoption revision, so an adoption change keeps the catalog. */
export function catalogKeyOf(
  tenant: TenantId,
  endpoint: AdoptedEndpoint,
  account: PeerAccount,
): CatalogKey {
  return { tenant, account, holding: endpoint.ref.holding }
}

/** The connection key. A new adoption revision is a new key, so a new connection. */
export function connectionKeyOf(
  tenant: TenantId,
  endpoint: AdoptedEndpoint,
  account: PeerAccount,
): ConnectionKey {
  return { tenant, holding: endpoint.ref.holding, adoptionRevision: endpoint.revision, account }
}
