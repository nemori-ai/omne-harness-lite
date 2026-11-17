import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { CalendarFaces, CalendarPrincipals } from '@omne-harness/calendar-access'
import { createCalendarAccessPlugin } from '@omne-harness/calendar-access/cordis'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'
import {
  calendarCalculatorKey,
  calendarQueryKey,
} from '@omne-harness/calendar-cordis-contract/cordis'
import { standingPrincipalRef } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { accountCodec, tenantCodec } from '@omne-harness/legal-identity'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

/** A person acting for their tenant: the tenant owns the call, the account is the human actor. */
export function personContext(
  principal: ActingForTenantPrincipal,
  tenantText: string,
  requestId: string,
) {
  const tenant = tenantCodec.parse(tenantText)
  const account = tenant.ok ? accountCodec.encode(tenant.value.account) : undefined
  if (!tenant.ok || account === undefined || !account.ok)
    throw new TypeError('calendar-access: the tenant text is not canonical')
  return calendarCallContextSchema.parse({
    principalRef: standingPrincipalRef(principal),
    owner: { kind: 'tenant', tenantId: tenantText, ownerId: account.value },
    actor: { kind: 'human', actorRef: account.value },
    authContextRef: 'calendar/v1',
    requestId,
    originatingSessionRef: null,
  })
}

function principalsOf(ctx: Context): CalendarPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
    contextOf: (principal, tenant, requestId) =>
      personContext(principal as unknown as ActingForTenantPrincipal, tenant, requestId),
  }
}

function facesOf(ctx: Context): CalendarFaces | undefined {
  const queries = ctx.get(calendarQueryKey)
  const calculator = ctx.get(calendarCalculatorKey)
  return queries === undefined || calculator === undefined ? undefined : { queries, calculator }
}

const plugin = createCalendarAccessPlugin({
  principals: principalsOf,
  faces: facesOf,
  requestId: randomUUID,
})

export const calendarAccessRow = defineRow({
  row: 'calendar-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey] },
})
