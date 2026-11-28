import type { TenantId } from '@omne-harness/legal-identity'
import {
  isCredentialBinding,
  mcpEndpointGates,
  type CredentialBinding,
} from '@omne-harness/mcp-contract'
import type {
  CredentialFailure,
  CredentialUse,
  GrantKey,
  HttpCredentialHandle,
} from '@omne-harness/mcp-contract/provider'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SecretBindingKey,
  SecretCustodyManagement,
  SecretCustodyUse,
} from '@omne-harness/settings'
import { holdingKey } from '../../assets/official-holdings.ts'
import { categoryCapabilityId } from '../../entry/category-gates.ts'

/** The settings item an endpoint's credential is kept under. */
export const CREDENTIAL_ITEM = 'credential'

export type CredentialCustody = Pick<SecretCustodyUse, 'use'> &
  Partial<Pick<SecretCustodyManagement, 'describe'>>

/** Where a secret item of one endpoint of one tenant is kept: the key its settings item is written under. */
export function endpointItemKey(
  tenant: TenantId,
  endpoint: string,
  item: string,
): SecretBindingKey {
  return holdingKey(
    { layer: 'tenant', tenant },
    {
      providerId: mcpEndpointGates.ownerId,
      definitionId: categoryCapabilityId(mcpEndpointGates.category, endpoint),
    },
    item,
  )
}

export const credentialKey = (tenant: TenantId, endpoint: string): SecretBindingKey =>
  endpointItemKey(tenant, endpoint, CREDENTIAL_ITEM)

/** The binding adoption hands MCP: the holding the credential belongs to, the endpoint's name, and whether it is an OAuth grant. */
export function credentialBinding(
  holding: string,
  endpoint: string,
  kind: 'static' | 'oauth' = 'static',
): CredentialBinding | undefined {
  const text = JSON.stringify(kind === 'oauth' ? [holding, endpoint, kind] : [holding, endpoint])
  return isCredentialBinding(text) ? text : undefined
}

function boundOf(
  binding: CredentialBinding,
  holding: string,
): Readonly<{ endpoint: string; oauth: boolean }> | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(binding)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 3) return undefined
  const [of, endpoint, kind] = parsed as unknown[]
  if (of !== holding || typeof endpoint !== 'string') return undefined
  if (parsed.length === 3 && kind !== 'oauth') return undefined
  return { endpoint, oauth: parsed.length === 3 }
}

export type GrantUse = (
  key: GrantKey,
  target: string,
) => Promise<Outcome<HttpCredentialHandle, CredentialFailure>>

function httpHandle(secret: string): HttpCredentialHandle {
  let usable = true
  return Object.freeze({
    purpose: 'http-authorization' as const,
    async authorize(headers: Headers) {
      if (!usable) return fail('rejected' as const)
      headers.set('authorization', `Bearer ${secret}`)
      return succeed(true as const)
    },
    async reportRejection() {
      usable = false
    },
    async release() {
      usable = false
    },
  })
}

// The custody is read at each acquisition: while it is away the answer is `unknown`.
export function createCredentialUse(
  custody: () => CredentialCustody | undefined,
  grants?: GrantUse,
): CredentialUse<unknown> {
  return {
    async acquire(access, holding, purpose, binding) {
      const bound = boundOf(binding, holding)
      if (bound === undefined) return fail('missing')
      const { endpoint } = bound
      if (bound.oauth) {
        if (grants === undefined) return fail('missing')
        try {
          return await grants({ tenant: access.tenant, holding, endpoint }, purpose.target)
        } catch {
          return fail('unknown')
        }
      }
      const store = custody()
      if (store === undefined) return fail('unknown')
      let used: ReturnType<SecretCustodyUse['use']>
      try {
        used = store.use(credentialKey(access.tenant, endpoint))
      } catch {
        return fail('unknown')
      }
      if (used === 'missing') return fail('missing')
      if (used === 'denied') return fail('rejected')
      if (used === 'unavailable') return fail('unknown')
      return succeed(httpHandle(used.value))
    },
  }
}
