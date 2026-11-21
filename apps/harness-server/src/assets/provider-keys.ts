import type { TenantId } from '@omne-harness/legal-identity'
import type { SecretCustodyUse, SecretScope } from '@omne-harness/settings'
import { providerCredentialKey, releaseProvider } from './model-providers.ts'

export type ProviderKey =
  | Readonly<{ kind: 'key'; value: string }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'unavailable' }>

const MISSING: ProviderKey = Object.freeze({ kind: 'missing' })
const UNAVAILABLE: ProviderKey = Object.freeze({ kind: 'unavailable' })

/** The bearer key of a release provider for a tenant: the tenant's own, else the deployment's. */
export function providerKeyOf(name: string, custody: Pick<SecretCustodyUse, 'use'>) {
  const provider = releaseProvider(name)
  const item = provider?.body.credentials[0]?.item
  const read = (scope: SecretScope): ProviderKey | null => {
    if (provider === undefined || item === undefined) return MISSING
    const used = custody.use(providerCredentialKey(provider, scope, item))
    if (used === 'missing') return null
    return typeof used === 'string' ? UNAVAILABLE : { kind: 'key', value: used.value }
  }
  return (tenant: TenantId): ProviderKey =>
    read({ layer: 'tenant', tenant }) ?? read({ layer: 'official' }) ?? MISSING
}
