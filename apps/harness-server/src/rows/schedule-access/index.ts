import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import {
  scheduleCommandsKey,
  scheduleJobsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import type { ScheduleFaces, SchedulePrincipals } from '@omne-harness/schedule-access'
import { createScheduleAccessPlugin } from '@omne-harness/schedule-access/cordis'
import { instantTextOf } from '../../entry/time.ts'
import { defineRow } from '../../row.ts'
import { personContext } from '../calendar-access/index.ts'
import { scheduleSessionSide } from '../schedule/session-side.ts'
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
  const jobs = ctx.get(scheduleJobsKey)
  return commands === undefined || queries === undefined || jobs === undefined
    ? undefined
    : { commands, queries, jobs }
}

export const scheduleAccessConfig = z.strictObject({
  /** The Agent definition a new session takes when a person leaves it out; absent: a person names it. */
  defaultDefinition: z.string().min(1).optional(),
})
type Config = z.infer<typeof scheduleAccessConfig>

/** Built when the row applies, so its clock is the time of this run. */
const pluginOf = (ctx: Context, config: Config) =>
  createScheduleAccessPlugin({
    principals: principalsOf,
    faces: facesOf,
    requestId: randomUUID,
    clock: { now: () => ScheduleInstantSchema.parse(instantTextOf(ctx, 'schedule-access')) },
    newSessionDefaults: scope => async tenant =>
      config.defaultDefinition === undefined
        ? undefined
        : scheduleSessionSide(scope).ofDefinition?.(tenant, config.defaultDefinition),
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
  plugin: {
    name: 'schedule-access',
    inject: [accessRegistryKey, principalIssuerKey],
    Config: scheduleAccessConfig,
    apply: (ctx: Context, config: Config) => pluginOf(ctx, config).apply(ctx, undefined),
  },
})
