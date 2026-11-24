import type { TenantId } from '@omne-harness/legal-identity'
import {
  isCredentialBinding,
  mcpEndpointGates,
  type CredentialBinding,
} from '@omne-harness/mcp-contract'
import type { CredentialUse, HttpCredentialHandle } from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
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

/** Where the credential of one endpoint of one tenant is kept: the key its settings item is written under. */
export function credentialKey(tenant: TenantId, endpoint: string): SecretBindingKey {
  return holdingKey(
    { layer: 'tenant', tenant },
    {
      providerId: mcpEndpointGates.ownerId,
      definitionId: categoryCapabilityId(mcpEndpointGates.category, endpoint),
    },
    CREDENTIAL_ITEM,
  )
}

/** The binding adoption hands MCP: the holding the credential belongs to, and the endpoint's name. */
export function credentialBinding(
  holding: string,
  endpoint: string,
): CredentialBinding | undefined {
  const text = JSON.stringify([holding, endpoint])
  return isCredentialBinding(text) ? text : undefined
}

function endpointOf(binding: CredentialBinding, holding: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(binding)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
  const [of, endpoint] = parsed as unknown[]
  return of === holding && typeof endpoint === 'string' ? endpoint : undefined
}

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
): CredentialUse<unknown> {
  return {
    async acquire(access, holding, _purpose, binding) {
      const endpoint = endpointOf(binding, holding)
      if (endpoint === undefined) return fail('missing')
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
