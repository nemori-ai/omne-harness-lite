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
  type ScheduleJobs,
  type ScheduleQueries,
} from '@omne-harness/schedule-contract'
import {
  ScheduleCommandsService,
  ScheduleQueriesService,
  scheduleCommandsKey,
  scheduleCarriersKey,
  scheduleExecutorsKey,
  scheduleJobsKey,
  ScheduleJobsService,
  scheduleProgramsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import {
  createScheduleCalendarEnvironment,
  createProgramExecutor,
  createScheduleLocalApplication,
  type ScheduleLocalApplication,
} from '@omne-harness/schedule-local'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import {
  storageKey,
  tenantDomainLookupKey,
  tenantDomainsKey,
} from '@omne-harness/sql-contract/cordis'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantStandingKey } from '@omne-harness/identity/cordis'
import type { TenantStandingSource } from '@omne-harness/identity'
import { accountCodec, tenantCodec } from '@omne-harness/legal-identity'
import { z } from 'zod'
import { instantTextOf, runTimeOf } from '../../entry/time.ts'
import { TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY } from '../../entry/tenant-domain-scanner.ts'
import { defineRow } from '../../row.ts'
import { environmentOf } from '../calendar/index.ts'
import {
  tenantIndependentSettingsKey,
  type TenantIndependentSettingsService,
} from '../governance/independent-settings-service.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { monotonicClock } from '../../shutdown.ts'
import { createScheduleAuthorizers } from './authorizer.ts'
import { createCarriers, executorOf, missingCarriers, type Carriers } from './carriers.ts'
import { SCHEDULE_PARTICIPANTS, scheduleDispatchGuards, scheduleGuards } from './guard.ts'
import { tenantDomainOf } from './tenant-domain.ts'
import { liveCallOrigin } from '../tool-bindings/live-calls.ts'

const OWNER = 'harness-server.schedule'

const nowOf = (ctx: Context) => () => ScheduleInstantSchema.parse(instantTextOf(ctx, 'schedule'))

const positive = z.int().min(1)
/** How the dispatcher watches: its round interval, the longest gap still counted as watched, the slots per round. */
export const scheduleRowConfig = z.strictObject({
  dispatch: z
    .strictObject({
      intervalMs: positive.default(15_000),
      gapMs: positive.default(120_000),
      roundLimit: positive.max(50).default(20),
      classifyPages: positive.max(100).default(10),
    })
    .prefault({}),
})
type ScheduleRowConfig = z.infer<typeof scheduleRowConfig>

function ownerOf(tenantRef: string) {
  const tenant = tenantCodec.parse(tenantRef)
  const account = tenant.ok ? accountCodec.encode(tenant.value.account) : undefined
  if (!tenant.ok || account === undefined || !account.ok) return undefined
  return { kind: 'tenant' as const, tenantId: tenantRef, ownerId: account.value }
}

/** Whether the owner may have work accepted now, from identity's current standing of the tenant. */
function standingOf(ctx: Context, tenantRef: string) {
  return async () => {
    const source = ctx.get(tenantStandingKey) as TenantStandingSource | undefined
    const tenant = tenantCodec.parse(tenantRef)
    if (source === undefined || !tenant.ok) return { kind: 'unknown' as const }
    const reading = await source.read({ tenant: tenant.value }).catch(() => undefined)
    if (reading?.kind === 'member') return { kind: 'eligible' as const }
    if (reading?.kind === 'not-member')
      return { kind: 'terminal' as const, reason: 'owner-not-member' }
    return { kind: 'unknown' as const }
  }
}

const unavailable = (requestId: string): ScheduleDomainError => ({
  code: 'provider_failure',
  message: 'the schedule store of this tenant is not available',
  retryable: true,
  requestId,
  details: {},
})

type Listener = Readonly<{ changed(): void; closed(): void }>

class Watchers {
  private readonly byTenant = new Map<string, Set<Listener>>()
  add(tenant: string, listener: Listener): () => void {
    const set = this.byTenant.get(tenant) ?? new Set<Listener>()
    this.byTenant.set(tenant, set)
    set.add(listener)
    return () => set.delete(listener)
  }
  changed(tenant: string): void {
    for (const listener of this.byTenant.get(tenant) ?? []) listener.changed()
  }
  close(): void {
    for (const set of this.byTenant.values()) for (const listener of set) listener.closed()
    this.byTenant.clear()
  }
}

type Host = Readonly<{
  watchers: Watchers
  applicationOf(context: ScheduleCallContext): Promise<ScheduleLocalApplication | undefined>
  /** Opens the application of every tenant the directory lists, so each has a dispatcher without waiting for a call. */
  watchAll(): Promise<void>
  close(): Promise<void>
}>

async function registration() {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: SCHEDULE_PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error('schedule combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return { combinationVersion: `harness-schedule/${digest.slice(0, 16)}`, manifestDigest: digest }
}

async function openTenantApplication(
  ctx: Context,
  config: ScheduleRowConfig,
  carriers: Carriers & Readonly<{ changed: (tenant: string) => void }>,
  tenantRef: string,
  combination: () => Promise<Readonly<{ combinationVersion: string; manifestDigest: string }>>,
): Promise<ScheduleLocalApplication | undefined> {
  const storage = ctx.get(storageKey) as SqlStorage
  const domains = ctx.get(tenantDomainLookupKey) as TenantDomainLookup
  const independent = () =>
    ctx.get(tenantIndependentSettingsKey) as TenantIndependentSettingsService
  const domain = await tenantDomainOf(
    {
      lookup: domains,
      registration: ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
    },
    tenantRef,
  )
  if (domain === undefined) return undefined
  const fixed = await combination()
  const registered = await storage.registerCombination({
    scope: domain.scope,
    transactionDomain: domain.transactionDomain,
    ...fixed,
    participants: SCHEDULE_PARTICIPANTS,
  })
  if (registered.kind !== 'registered') return undefined
  const owner = ownerOf(tenantRef)
  if (owner === undefined) return undefined
  const calendar = ctx.get(calendarQueryKey) as CalendarQueries
  const authorizers = createScheduleAuthorizers({ origin: liveCallOrigin(ctx), now: nowOf(ctx) })
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
      environment: createScheduleCalendarEnvironment(environmentOf(independent())),
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
      clock: { now: nowOf(ctx) },
      ids: { schedule: () => ScheduleIdSchema.parse(randomUUID()) },
    },
    query: {
      authorizer: authorizers.read,
      limits: {
        timeoutMs: 10_000,
        maxDependencyCalls: 1000,
        maxAgendaSchedules: 1000,
        maxAgendaRows: 5000,
      },
    },
    dispatch: {
      owner,
      guards: scheduleDispatchGuards,
      time: runTimeOf(ctx),
      standing: standingOf(ctx, tenantRef),
      missingCarriers: purpose => missingCarriers(carriers, purpose),
      executor: work => executorOf(carriers, work),
      policy: config.dispatch,
      report: error =>
        ctx.logger('schedule').warn('schedule dispatch round failed: %s', String(error)),
      changed: () => carriers.changed(tenantRef),
    },
  })
}

/** One schedule application per tenant, in the tenant's own domain; registered the first time it is asked. */
function createTenantHost(ctx: Context, config: ScheduleRowConfig, carriers: Carriers): Host {
  const opened = new Map<string, Promise<ScheduleLocalApplication | undefined>>()
  const watchers = new Watchers()
  let combination:
    | Promise<Readonly<{ combinationVersion: string; manifestDigest: string }>>
    | undefined

  const open = (tenantRef: string) =>
    openTenantApplication(
      ctx,
      config,
      { ...carriers, changed: tenant => watchers.changed(tenant) },
      tenantRef,
      () => (combination ??= registration()),
    )

  function openTenant(tenantRef: string): Promise<ScheduleLocalApplication | undefined> {
    let opening = opened.get(tenantRef)
    if (opening === undefined) {
      opening = open(tenantRef).catch(() => undefined)
      opened.set(tenantRef, opening)
    }
    return opening
  }

  return {
    watchers,
    async watchAll() {
      const directory = ctx.get(tenantDomainsKey) as TenantDomains<unknown> | undefined
      const listed = await directory
        ?.enumerate({ principal: ctx.get(TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY) })
        .catch(() => undefined)
      if (listed?.kind !== 'ready') return
      await Promise.all(listed.entries.map(entry => openTenant(entry.tenant)))
    },
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
      watchers.close()
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

class Jobs extends ScheduleJobsService {
  readonly get: ScheduleJobs['get']
  readonly cancel: ScheduleJobs['cancel']
  readonly queryCancel: ScheduleJobs['queryCancel']
  readonly start: ScheduleJobs['start']
  readonly queryStart: ScheduleJobs['queryStart']
  constructor(ctx: Context, host: Host) {
    super(ctx)
    const via =
      <I, R>(call: (jobs: ScheduleJobs, context: ScheduleCallContext, input: I) => Promise<R>) =>
      async (context: ScheduleCallContext, input: I) => {
        const jobs = (await host.applicationOf(context))?.jobs
        return jobs === undefined
          ? ({ kind: 'error', error: unavailable(context.requestId) } as R)
          : call(jobs, context, input)
      }
    this.get = via((j, c, i) => j.get(c, i))
    this.cancel = via((j, c, i) => j.cancel(c, i))
    this.queryCancel = via((j, c, i) => j.queryCancel(c, i))
    this.start = via((j, c, i) => j.start(c, i))
    this.queryStart = via((j, c, i) => j.queryStart(c, i))
    this.watch = (tenant, listener) => host.watchers.add(tenant, listener)
  }
  readonly watch: ScheduleJobsService['watch']
}

export const scheduleRow = defineRow({
  row: 'schedule',
  implementation: 'real',
  manifest: {
    provides: [
      scheduleCommandsKey,
      scheduleQueriesKey,
      scheduleJobsKey,
      scheduleProgramsKey,
      scheduleExecutorsKey,
      scheduleCarriersKey,
    ],
    injects: [
      storageKey,
      tenantDomainLookupKey,
      tenantDomainsKey,
      TENANT_DOMAIN_SCANNER_PRINCIPAL_KEY,
      tenantStandingKey,
      calendarQueryKey,
      tenantIndependentSettingsKey,
    ],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: scheduleRowConfig,
  async body(ctx, raw) {
    const carriers = createCarriers(ctx)
    carriers.executors.register(
      'program',
      createProgramExecutor(name => carriers.programs.get(name)),
    )
    const host = createTenantHost(ctx, scheduleRowConfig.parse(raw ?? {}), carriers)
    new Commands(ctx, host)
    new Queries(ctx, host)
    new Jobs(ctx, host)
    return {
      /** After every row applied, so the programs and carriers rows register are there for the first round. */
      async start() {
        void host.watchAll()
      },
      async stop() {
        await host.close()
        return { kind: 'settled' }
      },
    }
  },
})
