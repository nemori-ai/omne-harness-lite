// The tenant model credential of this host (SPEC「模型凭据」). This deployment keys a tenant's own
// model credential by the tenant alone: every official profile it publishes sends to one recipient
// (`openrouter`), so one binding per tenant covers every send it can make. The product leaves the
// number of channels and their keys to the contract of a new kind of access (model design
// MODEL-M04); a deployment with more recipients extends this key, not the public operations.
//
// Two consumers read this file: the credential custody port of the `model-credential` row, which
// binds under the id below, and request preparation, which completes a supplier with the tenant
// reference when that binding is present and with the factory reference only when it is not.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { SupplierPort } from '@omne-harness/model'
import type { CredentialId, ModelFailure } from '@omne-harness/model-contract'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialPort,
} from '@omne-harness/model-contract/provider'

/**
 * The credential id of a tenant's own model credential. The custody names it, Model does not mint
 * it (model-contract「凭据引用与解析端口」). The prefix keeps it apart from the configured
 * `factoryQueryId`, and the tenant text makes it unique to one tenant, so the custody never sees
 * one id held by two tenants. `undefined` for a tenant that does not encode.
 */
export function tenantCredentialId(tenant: TenantId): CredentialId | undefined {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) return undefined
  const decoded = decodeCredentialId(
    `tenant-model-send:${tenant.organization.text}/${tenant.account.text}`,
  )
  return 'ok' in decoded ? decoded.ok : undefined
}

const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: 'model-credential',
  diagnostic,
})

/**
 * Completes a profile supplier with the credential reference of the calling tenant: the tenant
 * reference when the tenant has its own binding, the factory reference when it has none. A custody
 * that cannot say whether the binding exists stops the preparation: it never falls back to the
 * factory reference. The secret is not read here; the send reads it in its fence.
 */
export function tenantCredentialSupplier(
  readPort: () => CredentialPort | undefined,
): SupplierPort<unknown> {
  return ({ supplier, principal, tenant }) => {
    const id = tenantCredentialId(tenant)
    if (id === undefined) return { failure: { kind: 'denied', action: 'model-credential' } }
    const port = readPort()
    if (port?.presentFor === undefined) return { failure: unavailable('credential-custody-absent') }
    let presence: ReturnType<NonNullable<CredentialPort['presentFor']>>
    try {
      presence = port.presentFor({ id, purpose: MODEL_SEND, access: { principal, tenant } })
    } catch {
      return { failure: unavailable('credential-custody-failed') }
    }
    switch (presence.kind) {
      case 'known':
        return {
          ok: {
            adoption: supplier.adoption,
            recipient: supplier.recipient,
            model: supplier.model,
            credential: presence.present ? { kind: 'tenant', id } : { kind: 'factory' },
          },
        }
      case 'denied':
        return { failure: { kind: 'denied', action: 'model-credential' } }
      case 'unavailable':
        return { failure: unavailable('credential-custody-unavailable') }
      default: {
        const _exhaustive: never = presence
        return _exhaustive
      }
    }
  }
}
