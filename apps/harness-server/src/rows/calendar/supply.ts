import type { Context } from '@deepseek-ai/cordis'
import {
  CALENDAR_SUPPLY_POLICY_VERSION,
  createCalendarSupplyApplication,
  type CalendarHealthProjection,
  type CalendarSupplyApplication,
} from '@omne-harness/calendar'
import {
  calendarCallContextSchema,
  calendarIdSchema,
  instantSchema,
} from '@omne-harness/calendar-contract'
import { calendarSupplyKey } from '@omne-harness/calendar-cordis-contract/cordis'
import {
  createCalendarSourceAdapters,
  shippedCalendarSeedRelease,
  shippedCalendarSupplyInputs,
} from '@omne-harness/calendar-local'
import { CalendarLocalSupplyProvider } from '@omne-harness/calendar-local/cordis'
import { z } from 'zod'
import { runTimeOf } from '../../entry/time.ts'

export const CALENDAR_OWNER = 'harness-server.calendar'
const ACTIONS = new Set([
  'probe',
  'refresh',
  'importSeed',
  'queryPublication',
  'health',
  'reaction',
])

/** Operator configuration of the calendar row; the code holds only initial values. */
export const calendarRowConfig = z
  .object({
    supplyIntervalMs: z.number().int().positive().max(2_147_483_647).default(3_600_000),
    supplyDrainTimeoutMs: z.number().int().positive().max(2_147_483_647).default(10_000),
    // Only loopback http origins are accepted by the source adapters; tests point sources here.
    sourceTestOrigins: z.record(z.string(), z.string()).optional(),
  })
  .strict()
export type CalendarRowConfig = z.infer<typeof calendarRowConfig>

function systemContext(purpose: string) {
  return calendarCallContextSchema.parse({
    principalRef: CALENDAR_OWNER,
    owner: { kind: 'system', systemScopeRef: CALENDAR_OWNER },
    actor: { kind: 'system', actorRef: CALENDAR_OWNER },
    authContextRef: `${CALENDAR_OWNER}.${purpose}`,
    requestId: `${CALENDAR_OWNER}.${purpose}/${crypto.randomUUID()}`,
    originatingSessionRef: null,
  })
}

export const SEED_CONTEXT = calendarCallContextSchema.parse({
  ...systemContext('seed'),
  requestId: `${CALENDAR_OWNER}.seed/${shippedCalendarSeedRelease.releaseRef}`,
})

/** Supply acts only as this release's own system scope; any other owner is refused. */
export const calendarSupplyAuthority: Parameters<
  typeof createCalendarSupplyApplication
>[0]['authority'] = {
  async check({ context, action }) {
    return ACTIONS.has(action) &&
      context.owner.kind === 'system' &&
      context.owner.systemScopeRef === CALENDAR_OWNER
      ? { kind: 'allowed', authorityGuardRefs: [`${CALENDAR_OWNER}.${action}`] }
      : { kind: 'denied', reason: 'calendar supply belongs to the release system scope' }
  },
}

export function calendarSourceAdapters(config: CalendarRowConfig) {
  const shipped = shippedCalendarSupplyInputs()
  return {
    sourceAdapters: createCalendarSourceAdapters({
      ...shipped.sourceOptions,
      ...(config.sourceTestOrigins ? { testEndpoints: { origins: config.sourceTestOrigins } } : {}),
    }),
    independenceRegistry: shipped.independenceRegistry,
  }
}

/** Reads supply health as the system; the query service never sees supply. */
export function healthProjection(supply: CalendarSupplyApplication): CalendarHealthProjection {
  return calendarId =>
    supply.health(systemContext('health'), {
      calendarId: calendarIdSchema.parse(calendarId),
      policyVersion: CALENDAR_SUPPLY_POLICY_VERSION,
    })
}

/** Hands the supply application to the local provider, which owns the runner and its stop. */
export function provideCalendarSupply(
  ctx: Context,
  supply: CalendarSupplyApplication,
  config: CalendarRowConfig,
) {
  const logger = ctx.logger('calendar')
  ctx.plugin(CalendarLocalSupplyProvider, {
    drainTimeoutMs: config.supplyDrainTimeoutMs,
    observer: {
      name: 'harness-server.calendar',
      observe: report => logger.info('calendar supply stopped', report),
    },
    binding: {
      kind: 'owned',
      create: () => supply,
      runner: {
        contextSupplier: async () => systemContext('runner'),
        seed: null,
        initializationOperationKey: `${CALENDAR_OWNER}.initialize`,
        acknowledgementKey: `${CALENDAR_OWNER}.acknowledge`,
        intervalMs: config.supplyIntervalMs,
        timers: runTimeOf(ctx),
        drainTimeoutMs: config.supplyDrainTimeoutMs,
        limit: 10,
        phases: { recover: true, runDue: true, deliverReactions: true },
        observer: {
          name: 'harness-server.calendar.runner',
          observe: event => logger.debug('calendar runner', event),
        },
      },
    },
  })
  return calendarSupplyKey
}

export const supplyClock = (now: () => number) => ({
  now: () => instantSchema.parse(new Date(now()).toISOString()),
})
