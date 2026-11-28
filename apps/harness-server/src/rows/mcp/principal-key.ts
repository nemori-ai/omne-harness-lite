import { standingPrincipalRef } from '@omne-harness/identity'
import { accountCodec } from '@omne-harness/legal-identity'
import { classify } from '../authorization/principals.ts'

/** The text MCP keys a principal by: a system component, or the standing reference of a member. */
export function principalKey(principal: unknown): string {
  const who = classify(principal)
  if (who === null) throw new TypeError('MCP was asked by a principal the release does not know')
  return who.column === 'system'
    ? `system/${who.principal.component}`
    : standingPrincipalRef(who.principal)
}

/** The person a principal stands for: a member acts only for its own account's tenant, so the account, whichever login it came in by. */
export function subscriberOf(principal: unknown): string {
  const who = classify(principal)
  if (who === null || who.column === 'system') return principalKey(principal)
  const account = accountCodec.encode(who.principal.tenant.account)
  return account.ok ? `person:${account.value}` : principalKey(principal)
}
