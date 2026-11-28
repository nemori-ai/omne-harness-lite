import { standingPrincipalRef } from '@omne-harness/identity'
import { classify } from '../authorization/principals.ts'

/** The text MCP keys a principal by: a system component, or the standing reference of a member. */
export function principalKey(principal: unknown): string {
  const who = classify(principal)
  if (who === null) throw new TypeError('MCP was asked by a principal the release does not know')
  return who.column === 'system'
    ? `system/${who.principal.component}`
    : standingPrincipalRef(who.principal)
}
