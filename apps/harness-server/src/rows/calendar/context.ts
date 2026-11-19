import type { Context } from '@deepseek-ai/cordis'
import type { CalendarHealthProjection } from '@omne-harness/calendar'
import {
  calendarEnvironmentBlock,
  calendarSupplyRiskBlock,
  createCalendarEnvironmentReader,
  type CalendarEnvironmentValue,
} from '@omne-harness/calendar-adapters'
import { calendarCallContextSchema, type CalendarId } from '@omne-harness/calendar-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  runtimeContextTenantBlocksKey,
  runtimeContextTenantScopeKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { tenantScopePrincipalsKey } from '../../entry/tenant-scope-principals.ts'
import type { TenantIndependentSettingsService } from '../governance/independent-settings-service.ts'
import { environmentOf } from './settings-environment.ts'

/** The settings side of the environment block: the tenant's own values, read at each ask. */
function environmentValue(settings: TenantIndependentSettingsService) {
  const environment = environmentOf(settings)
  return async (tenant: TenantId): Promise<CalendarEnvironmentValue | null> => {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) return null
    const read = await environment.read(
      calendarCallContextSchema.parse({
        principalRef: 'harness-server.calendar.environment',
        owner: { kind: 'tenant', tenantId: text.value, ownerId: text.value },
        actor: { kind: 'system', actorRef: 'harness-server.calendar.environment' },
        authContextRef: 'harness-server.calendar.environment',
        requestId: `harness-server.calendar.environment/${crypto.randomUUID()}`,
        originatingSessionRef: null,
      }),
    )
    if (read.kind === 'missing') return { kind: 'missing' }
    if (read.kind !== 'found') return null
    const { revision, timezone, calendarId } = read.value
    return { kind: 'found', revision, timezone, calendarId }
  }
}

/** All shipped calendars or none: one unreadable health makes the risks unknown. */
function healthOfAll(projection: CalendarHealthProjection, calendars: readonly CalendarId[]) {
  return async () => {
    const all = []
    for (const calendarId of calendars) {
      const read = await projection(calendarId)
      if (read.kind !== 'ok') return null
      all.push(read.value)
    }
    return all
  }
}

/** Registers the two tenant-level blocks of the calendar and answers the reader the queries use. */
export function calendarContext(
  ctx: Context,
  settings: TenantIndependentSettingsService,
  projection: CalendarHealthProjection,
  calendars: readonly CalendarId[],
) {
  ctx.inject([runtimeContextTenantBlocksKey], child => {
    child[runtimeContextTenantBlocksKey].register({
      blocks: [
        calendarEnvironmentBlock(environmentValue(settings)),
        calendarSupplyRiskBlock(healthOfAll(projection, calendars)),
      ],
    })
  })
  return createCalendarEnvironmentReader<unknown>({
    scope: () => ctx.get(runtimeContextTenantScopeKey),
    async reader(tenantId) {
      const tenant = tenantCodec.parse(tenantId)
      if (!tenant.ok) return null
      const principal = ctx.get(tenantScopePrincipalsKey)?.forTenant(tenant.value)
      return principal === undefined ? null : { principal, tenant: tenant.value }
    },
  })
}
