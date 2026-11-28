import type { GrantSecrets, SecretSlot } from '@omne-harness/mcp-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  parseSecretText,
  type SecretBindingKey,
  type SecretCustodyManagement,
  type SecretCustodyUse,
} from '@omne-harness/settings'
import { credentialKey } from './credential.ts'

/** The purposes MCP declares as a trusted credential custodian; the person's own credential is purpose `setting`. */
export const GRANT_PURPOSES = {
  access: 'mcp-oauth-access',
  refresh: 'mcp-oauth-refresh',
  client: 'mcp-oauth-client',
} as const

/** Tokens can be longer than what a person types; the bound stays a bound. */
export const GRANT_SECRET_MAX_LENGTH = 16_384

export type GrantCustody = Pick<SecretCustodyManagement, 'bind' | 'unbind'> &
  Pick<SecretCustodyUse, 'use'>

/** Access and refresh share the target of the endpoint's credential item; a client secret is MCP's own target of its tenant. */
export function grantSecretKey(slot: SecretSlot): SecretBindingKey {
  if (slot.kind === 'client')
    return {
      scope: { layer: 'tenant', tenant: slot.tenant },
      target: { owner: 'mcp-oauth-client', key: slot.issuer },
      purpose: GRANT_PURPOSES.client,
    }
  return {
    ...credentialKey(slot.key.tenant, slot.key.endpoint),
    purpose: GRANT_PURPOSES[slot.kind],
  }
}

export function createGrantSecrets(custody: () => GrantCustody | undefined): GrantSecrets {
  const attempt = <T>(work: (store: GrantCustody) => T): T | 'unavailable' => {
    const store = custody()
    if (store === undefined) return 'unavailable'
    try {
      return work(store)
    } catch {
      return 'unavailable'
    }
  }
  return {
    async read(slot) {
      const used = attempt(store => store.use(grantSecretKey(slot)))
      if (used === 'missing') return succeed('absent')
      return typeof used === 'object' ? succeed(used.value) : fail('unavailable')
    },
    async write(slot, value) {
      const secret = parseSecretText(value, GRANT_SECRET_MAX_LENGTH)
      if (!secret.ok) return fail('unavailable')
      const written = attempt(store => store.bind(grantSecretKey(slot), secret.value, null))
      return written === 'written' ? succeed(true) : fail('unavailable')
    },
    async remove(slot) {
      const removed = attempt(store => store.unbind(grantSecretKey(slot)))
      return removed === 'removed' || removed === 'absent' ? succeed(true) : fail('unavailable')
    },
  }
}
