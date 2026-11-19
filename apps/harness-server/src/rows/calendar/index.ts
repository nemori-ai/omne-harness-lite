import type { Context } from '@deepseek-ai/cordis'
import {
  createCalendarCalculator,
  createCalendarQueries,
  createCalendarSupplyApplication,
  shippedCalendarSupplyPolicies,
} from '@omne-harness/calendar'
import {
  calendarIdSchema,
  timezoneSchema,
  type CalendarCalculator,
  type CalendarQueries,
} from '@omne-harness/calendar-contract'
import {
  CalendarCalculatorService,
  CalendarQueryService,
  calendarCalculatorKey,
  calendarQueryKey,
  calendarSupplyKey,
} from '@omne-harness/calendar-cordis-contract/cordis'
import {
  createCalendarSqlPersistence,
  createCalendarSqlSupplyStorage,
  createShippedCalendarSeedRegistry,
  shippedCalendarSeedRelease,
} from '@omne-harness/calendar-local'
import {
  CalendarLocalSupplyProvider,
  calendarEnvironmentSettingsPlugin,
} from '@omne-harness/calendar-local/cordis'
import type { TenantStandingSource } from '@omne-harness/identity'
import { tenantStandingKey } from '@omne-harness/identity/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import { combinationManifest, manifestDigest, type SqlStorage } from '@omne-harness/sql-contract'
import { storageKey } from '@omne-harness/sql-contract/cordis'
import { runtimeContextTenantBlocksKey } from '@omne-harness/runtime-context-cordis-contract/cordis'
import { epochMillisOf, readSystemInstant } from '../../entry/session-clock.ts'
import { defineRow } from '../../row.ts'
import {
  tenantIndependentSettingsKey,
  type TenantIndependentSettingsService,
} from '../governance/independent-settings-service.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { CALENDAR_DOMAIN, CALENDAR_PARTICIPANTS, calendarAuthority } from './authority.ts'
import { calendarContext } from './context.ts'
import {
  CALENDAR_OWNER,
  SEED_CONTEXT,
  calendarRowConfig,
  calendarSourceAdapters,
  calendarSupplyAuthority,
  healthProjection,
  provideCalendarSupply,
  supplyClock,
} from './supply.ts'

function now(): number {
  const instant = readSystemInstant()
  if (!instant.ok) throw new Error('calendar clock unavailable')
  return epochMillisOf(instant.text)
}

class Queries extends CalendarQueryService {
  readonly list: CalendarQueries['list']
  readonly get: CalendarQueries['get']
  readonly effective: CalendarQueries['effective']
  readonly resolve: CalendarQueries['resolve']
  readonly health: CalendarQueries['health']
  constructor(ctx: Context, queries: CalendarQueries) {
    super(ctx)
    this.list = (context, input) => queries.list(context, input)
    this.get = (context, input) => queries.get(context, input)
    this.effective = context => queries.effective(context)
    this.resolve = (context, input) => queries.resolve(context, input)
    this.health = context => queries.health(context)
  }
}

class Calculator extends CalendarCalculatorService {
  readonly answer: CalendarCalculator['answer']
  constructor(ctx: Context, calculator: CalendarCalculator) {
    super(ctx)
    this.answer = (context, question) => calculator.answer(context, question)
  }
}

async function registered(storage: SqlStorage) {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: CALENDAR_PARTICIPANTS })
  if (manifest.kind !== 'manifest')
    throw new Error(`calendar combination is not registrable: ${JSON.stringify(manifest)}`)
  const digest = manifestDigest(manifest.manifest)
  const combination = {
    ...CALENDAR_DOMAIN,
    combinationVersion: `harness-calendar/${digest.slice(0, 16)}`,
    manifestDigest: digest,
    participants: CALENDAR_PARTICIPANTS,
  }
  const result = await storage.registerCombination(combination)
  if (result.kind !== 'registered')
    throw new Error(`calendar combination registration ${result.kind}`)
  return combination
}

/** A tenant's calendar environment is its own preference target; the reader reads as the tenant. */

/** Reading a calendar takes being a member of the tenant that owns the call. */
function authorityOf(standing: TenantStandingSource) {
  return {
    async check({
      context,
    }: Readonly<{ context: { owner: { kind: string; tenantId?: string } } }>) {
      if (context.owner.kind !== 'tenant' || context.owner.tenantId === undefined)
        return { kind: 'denied' } as const
      const tenant = tenantCodec.parse(context.owner.tenantId)
      if (!tenant.ok) return { kind: 'denied' } as const
      try {
        const reading = await standing.read({ tenant: tenant.value })
        if (reading.kind === 'member') return { kind: 'allowed' } as const
        return reading.kind === 'not-member'
          ? ({ kind: 'denied' } as const)
          : ({ kind: 'unavailable' } as const)
      } catch {
        return { kind: 'unavailable' } as const
      }
    },
  }
}

export const calendarRow = defineRow({
  row: 'calendar',
  implementation: 'real',
  manifest: {
    provides: [calendarQueryKey, calendarCalculatorKey, calendarSupplyKey],
    injects: [
      storageKey,
      tenantStandingKey,
      tenantIndependentSettingsKey,
      runtimeContextTenantBlocksKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx, config) {
    const rowConfig = calendarRowConfig.parse(config ?? {})
    ctx.plugin(calendarEnvironmentSettingsPlugin)
    const storage = ctx.get(storageKey) as SqlStorage
    const combination = await registered(storage)
    const stores = {
      ...createCalendarSqlPersistence({
        storage,
        combination,
        authority: calendarAuthority('publication'),
      }),
      ...createCalendarSqlSupplyStorage({
        storage,
        combination,
        authority: calendarAuthority('supply'),
        systemScopeRef: CALENDAR_OWNER,
        seedPackRegistry: createShippedCalendarSeedRegistry(),
      }),
    }
    const supply = createCalendarSupplyApplication({
      ...stores,
      ...calendarSourceAdapters(rowConfig),
      authority: calendarSupplyAuthority,
      clock: supplyClock(now),
    })
    // The seed lands before any service is offered; the runner then follows the sources.
    const { releaseDate: _releaseDate, ...release } = shippedCalendarSeedRelease
    const imported = await supply.importSeed(SEED_CONTEXT, {
      ...release,
      operationKey: `${CALENDAR_OWNER}.seed/${release.releaseRef}`,
    })
    if (imported.kind !== 'ok')
      ctx
        .logger('calendar')
        .warn(`calendar seed import answered ${imported.error.code}: ${imported.error.message}`)
    const supplyKey = provideCalendarSupply(ctx, supply, rowConfig)
    const projection = healthProjection(supply)
    const catalog = shippedCalendarSupplyPolicies.map(
      ({ calendarId, timezone, semanticBoundary }) => ({
        calendarId: calendarIdSchema.parse(calendarId),
        timezone: timezoneSchema.parse(timezone),
        semanticBoundary,
      }),
    )
    const queries = createCalendarQueries({
      repository: stores.repository,
      environment: calendarContext(
        ctx,
        ctx.get(tenantIndependentSettingsKey) as TenantIndependentSettingsService,
        projection,
        catalog.map(entry => entry.calendarId),
      ),
      authority: authorityOf(ctx.get(tenantStandingKey) as TenantStandingSource),
      clock: { now },
      catalog,
      healthProjection: projection,
    })
    new Queries(ctx, queries)
    new Calculator(ctx, createCalendarCalculator(queries))
    return {
      async stop() {
        const report = await (ctx.get(supplyKey) as CalendarLocalSupplyProvider).close()
        if (report.inFlight === 'retained')
          return { kind: 'incomplete', detail: 'calendar supply work retained past the drain time' }
        if (report.cleanup.kind === 'failed')
          return {
            kind: 'failed',
            detail: `calendar supply cleanup failed: ${report.cleanup.message}`,
          }
        return { kind: 'settled' }
      },
    }
  },
})

export { environmentOf } from './settings-environment.ts'
