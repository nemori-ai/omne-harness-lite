import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import {
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import type { ScheduleFaces, SchedulePrincipals } from '@omne-harness/schedule-access'
import { createScheduleAccessPlugin } from '@omne-harness/schedule-access/cordis'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { defineRow } from '../../row.ts'
import { personContext } from '../calendar-access/index.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

function principalsOf(ctx: Context): SchedulePrincipals {
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

function facesOf(ctx: Context): ScheduleFaces | undefined {
  const commands = ctx.get(scheduleCommandsKey)
  const queries = ctx.get(scheduleQueriesKey)
  return commands === undefined || queries === undefined ? undefined : { commands, queries }
}

const plugin = createScheduleAccessPlugin({
  principals: principalsOf,
  faces: facesOf,
  requestId: randomUUID,
  clock: {
    now() {
      const instant = readSystemInstant()
      if (!instant.ok) throw new Error('schedule-access clock unavailable')
      return ScheduleInstantSchema.parse(instant.text)
    },
  },
})

export const scheduleAccessRow = defineRow({
  row: 'schedule-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey] },
})
