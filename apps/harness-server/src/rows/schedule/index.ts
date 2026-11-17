import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { CalendarQueries } from '@omne-harness/calendar-contract'
import { calendarQueryKey } from '@omne-harness/calendar-cordis-contract/cordis'
import {
  ScheduleIdSchema,
  ScheduleInstantSchema,
  type ScheduleCallContext,
  type ScheduleCommands,
  type ScheduleDomainError,
  type ScheduleQueries,
} from '@omne-harness/schedule-contract'
import {
  ScheduleCommandsService,
  ScheduleQueriesService,
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import {
  createScheduleCalendarEnvironment,
  createScheduleLocalApplication,
  type ScheduleLocalApplication,
} from '@omne-harness/schedule-local'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { defineRow } from '../../row.ts'
import { environmentOf } from '../calendar/index.ts'
import {
  preferenceSettingsKey,
  type PreferenceSettingsService,
} from '../governance/preference-settings-service.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { monotonicClock } from '../../shutdown.ts'
import { createScheduleAuthorizers } from './authorizer.ts'
import { readConsentMode } from './consent-setting.ts'
import { SCHEDULE_PARTICIPANTS, scheduleGuards } from './guard.ts'
import { tenantDomainOf } from './tenant-domain.ts'
import { readConsentAnswer } from './consent-answer.ts'
import { liveCallKey, liveCalls } from '../tool-bindings/live-calls.ts'
import { toolHitlHolder } from '../tool-hitl/holder.ts'

const OWNER = 'harness-server.schedule'

function now() {
  const instant = readSystemInstant()
  if (!instant.ok) throw new Error('schedule clock unavailable')
  return ScheduleInstantSchema.parse(instant.text)
}

const unavailable = (requestId: string): ScheduleDomainError => ({
  code: 'provider_failure',
  message: 'the schedule store of this tenant is not available',
  retryable: true,
  requestId,
  details: {},
})

type Host = Readonly<{
  applicationOf(context: ScheduleCallContext): Promise<ScheduleLocalApplication | undefined>
  close(): Promise<void>
}>

/** One schedule application per tenant, in the tenant's own domain; registered the first time it is asked. */
function createTenantHost(ctx: Context): Host {
  const storage = ctx.get(storageKey) as SqlStorage
  const domains = ctx.get(tenantDomainLookupKey) as TenantDomainLookup
  const preferences = () => ctx.get(preferenceSettingsKey) as PreferenceSettingsService
  const opened = new Map<string, Promise<ScheduleLocalApplication | undefined>>()
  let combination:
    | Promise<Readonly<{ combinationVersion: string; manifestDigest: string }>>
    | undefined

  async function registration() {
    const catalog = await productionStorageCatalog()
    const manifest = combinationManifest({ catalog, participants: SCHEDULE_PARTICIPANTS })
    if (manifest.kind !== 'manifest') throw new Error('schedule combination is not registrable')
    const digest = manifestDigest(manifest.manifest)
    return { combinationVersion: `harness-schedule/${digest.slice(0, 16)}`, manifestDigest: digest }
  }

  async function open(tenantRef: string): Promise<ScheduleLocalApplication | undefined> {
    const domain = await tenantDomainOf(
      {
        lookup: domains,
        registration: ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
      },
      tenantRef,
    )
    if (domain === undefined) return undefined
    const fixed = await (combination ??= registration())
    const registered = await storage.registerCombination({
      scope: domain.scope,
      transactionDomain: domain.transactionDomain,
      ...fixed,
      participants: SCHEDULE_PARTICIPANTS,
    })
    if (registered.kind !== 'registered') return undefined
    const calendar = ctx.get(calendarQueryKey) as CalendarQueries
    const authorizers = createScheduleAuthorizers({
      mode: tenant => readConsentMode(preferences(), tenant),
      answer: readConsentAnswer({
        live: (tenantRef, call) => liveCalls(ctx).get(liveCallKey(tenantRef, call)),
        decidedCards: () => toolHitlHolder(ctx).decidedCards,
      }),
      now,
    })
    return createScheduleLocalApplication({
      sql: {
        storage,
        scope: domain.scope,
        transactionDomain: domain.transactionDomain,
        ...fixed,
        guards: scheduleGuards,
      },
      worker: { maxConcurrent: 2, maxQueued: 16 },
      prediction: {
        calendar,
        environment: createScheduleCalendarEnvironment(environmentOf(preferences())),
        basisGuards: {
          prepare: async () => ({ kind: 'ok', value: { guardRef: `${OWNER}/basis` } }),
        },
        monotonicClock: { now: monotonicClock.now },
        versions: { tzdbVersion: `node-${process.versions.tz}`, ruleEngineVersion: `${OWNER}/1` },
        limits: {
          maxCandidates: 10_000,
          maxYears: 10,
          maxExplanations: 10_000,
          maxCalendarCalls: 10_000,
          timeoutMs: 10_000,
        },
      },
      management: {
        authorizer: authorizers.management,
        quota: {
          async inspect(input) {
            const releasing =
              input.request.kind === 'execute' &&
              (input.request.input.action === 'stop' || input.request.input.action === 'discard') &&
              input.current?.quota.kind === 'held'
            return {
              kind: 'ok',
              value: {
                guardRef: `${OWNER}/quota`,
                resultingHolding:
                  input.allocatedId !== null
                    ? { kind: 'held', reservationRef: `reservation:${input.allocatedId}` }
                    : releasing
                      ? { kind: 'released', releaseRef: `release:${input.operation.operationRef}` }
                      : null,
              },
            }
          },
        },
        clock: { now },
        ids: { schedule: () => ScheduleIdSchema.parse(randomUUID()) },
      },
      query: {
        authorizer: authorizers.read,
        history: {
          observe: async () => ({ kind: 'ok', value: { observationRevision: `${OWNER}/no-runs` } }),
          confirm: async () => ({ kind: 'ok', value: { observationRevision: `${OWNER}/no-runs` } }),
          read: async () => ({
            kind: 'ok',
            value: {
              items: [],
              nextCursor: null,
              total: { kind: 'exact', value: 0 },
              complete: true,
              observationRevision: `${OWNER}/no-runs`,
            },
          }),
        },
        limits: {
          timeoutMs: 10_000,
          maxDependencyCalls: 1000,
          maxAgendaSchedules: 1000,
          maxAgendaRows: 5000,
        },
      },
    })
  }

  return {
    async applicationOf(context) {
      if (context.owner.kind !== 'tenant') return undefined
      const tenantRef = context.owner.tenantId
      let opening = opened.get(tenantRef)
      if (opening === undefined) {
        opening = open(tenantRef).catch(() => undefined)
        opened.set(tenantRef, opening)
      }
      const application = await opening
      if (application === undefined) opened.delete(tenantRef)
      return application
    },
    async close() {
      const all = await Promise.all(opened.values())
      opened.clear()
      await Promise.all(all.map(application => application?.close()))
    },
  }
}

/** Each call goes to the application of the tenant that owns it; another tenant's store is never asked. */
class Commands extends ScheduleCommandsService {
  readonly create: ScheduleCommands['create']
  readonly execute: ScheduleCommands['execute']
  readonly queryOperation: ScheduleCommands['queryOperation']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    const via =
      <I, R>(
        call: (
          application: ScheduleLocalApplication,
          context: ScheduleCallContext,
          input: I,
        ) => Promise<R>,
        refused: (requestId: string) => R,
      ) =>
      async (context: ScheduleCallContext, input: I) => {
        const application = await host.applicationOf(context)
        return application === undefined
          ? refused(context.requestId)
          : call(application, context, input)
      }
    const rejected = (requestId: string) => ({
      kind: 'rejected' as const,
      error: unavailable(requestId),
    })
    const failed = (requestId: string) => ({
      kind: 'error' as const,
      error: unavailable(requestId),
    })
    this.create = via((a, c, i) => a.commands.create(c, i), rejected)
    this.execute = via((a, c, i) => a.commands.execute(c, i), rejected)
    this.queryOperation = via((a, c, i) => a.commands.queryOperation(c, i), failed)
  }
}

class Queries extends ScheduleQueriesService {
  readonly list: ScheduleQueries['list']
  readonly get: ScheduleQueries['get']
  readonly revisions: ScheduleQueries['revisions']
  readonly executions: ScheduleQueries['executions']
  readonly agenda: ScheduleQueries['agenda']
  readonly preview: ScheduleQueries['preview']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    const via =
      <I, R>(
        call: (queries: ScheduleQueries, context: ScheduleCallContext, input: I) => Promise<R>,
      ) =>
      async (context: ScheduleCallContext, input: I) => {
        const application = await host.applicationOf(context)
        return application === undefined
          ? ({ kind: 'error', error: unavailable(context.requestId) } as R)
          : call(application.queries, context, input)
      }
    this.list = via((q, c, i) => q.list(c, i))
    this.get = via((q, c, i) => q.get(c, i))
    this.revisions = via((q, c, i) => q.revisions(c, i))
    this.executions = via((q, c, i) => q.executions(c, i))
    this.agenda = via((q, c, i) => q.agenda(c, i))
    this.preview = via((q, c, i) => q.preview(c, i))
  }
}

export const scheduleRow = defineRow({
  row: 'schedule',
  implementation: 'real',
  manifest: {
    provides: [scheduleCommandsKey, scheduleQueriesKey],
    injects: [storageKey, tenantDomainLookupKey, calendarQueryKey, preferenceSettingsKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  async body(ctx) {
    const host = createTenantHost(ctx)
    new Commands(ctx, host)
    new Queries(ctx, host)
    return {
      async stop() {
        await host.close()
        return { kind: 'settled' }
      },
    }
  },
})
