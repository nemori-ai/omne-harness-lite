import type { Origin } from '@omne-harness/human-intervention'
import {
  standingPrincipalRef,
  type PrincipalIssuer,
  type SystemPrincipal,
} from '@omne-harness/identity'
import { accountEquals, type TenantId } from '@omne-harness/legal-identity'
import type { HitlEntryIssue, HitlEntryPrincipals } from '@omne-harness/server-entry'

export const HITL_ENTRY_COMPONENT = 'server-entry'
export const HITL_ENTRY_WORK = Object.freeze({ owner: 'harness.hitl', work: 'cards' })

const REFUSED: HitlEntryIssue = Object.freeze({ kind: 'refused' })

export function createHitlEntryPrincipals(
  issuer: Pick<PrincipalIssuer, 'issueSystem' | 'issueActingForTenant'>,
): HitlEntryPrincipals {
  let actor: SystemPrincipal | undefined
  const actorOf = (): SystemPrincipal | undefined => {
    if (actor !== undefined) return actor
    const issued = issuer.issueSystem({ component: HITL_ENTRY_COMPONENT })
    if ('failure' in issued) return undefined
    actor = issued.ok
    return actor
  }
  return Object.freeze({
    issue: async ({ account, tenant }) => {
      if (!accountEquals(tenant.account, account)) return REFUSED
      const system = actorOf()
      if (system === undefined) return REFUSED
      const issued = issuer.issueActingForTenant({ actor: system, tenant, work: HITL_ENTRY_WORK })
      return 'ok' in issued ? { kind: 'issued', principal: issued.ok } : REFUSED
    },
  })
}

export function hitlEntryRef(tenant: TenantId): string {
  return standingPrincipalRef({
    kind: 'acting-for-tenant',
    actor: { kind: 'system', component: HITL_ENTRY_COMPONENT },
    tenant,
    work: HITL_ENTRY_WORK,
  })
}

export type HitlAudience = (
  input: Readonly<{ tenant: TenantId; origin: Origin }>,
) => Readonly<{ readers: readonly string[]; responders: readonly string[] }>

export const hitlCardAudience: HitlAudience = ({ tenant }) => {
  const entry = hitlEntryRef(tenant)
  return { readers: [entry], responders: [entry] }
}
