import {
  channelNameSchema,
  eventTypeNameSchema,
  sourceNameSchema,
  tenantIdSchema,
  type CallContext,
  type ChannelName,
  type SendRequestInput,
  type SourceDeclaration,
  type TenantId,
} from '@omne-harness/notification-contract'
import {
  createNotificationLocalApplication,
  type NotificationLocalOptions,
  type NotificationPolicy,
  type Timers,
} from '@omne-harness/notification-local'
import {
  fakeAuthority,
  fakeChannel,
  fakeClock,
  fakeConsent,
  fakeStanding,
} from '@omne-harness/notification/testing'
import { openSqlWorld, type SqlWorld } from './storage/world.ts'

export const T1 = tenantIdSchema.parse('t1')
export const T2 = tenantIdSchema.parse('t2')
export const MINUTE = 60_000

export const policy = (overrides: Partial<NotificationPolicy> = {}): NotificationPolicy => ({
  bodyLength: 4000,
  causalDepth: 3,
  pageLimit: 50,
  listLimit: 3,
  retry: { maxAttempts: 3, backoffMs: [MINUTE] },
  deliverTimeoutMs: 5000,
  beat: { defaultMinutes: 30, minMinutes: 5, maxMinutes: 1440 },
  scanIntervalMs: 60_000,
  recipients: {
    person: { channel: channelNameSchema.parse('in-app'), minLevel: 'weak' },
    agent: null,
  },
  ...overrides,
})

/** Timers that fire only when a test says so. */
export function manualTimers() {
  const pending = new Map<number, { run: () => void; delayMs: number }>()
  let next = 0
  const timers: Timers = {
    set(run, delayMs) {
      next += 1
      pending.set(next, { run, delayMs })
      return next
    },
    clear: timer => void pending.delete(timer as number),
  }
  return {
    timers,
    pending,
    /** Fires every timer whose delay is at most the given one, once. */
    fire(atMostMs: number) {
      for (const [id, timer] of Array.from(pending)) {
        if (timer.delayMs > atMostMs) continue
        pending.delete(id)
        timer.run()
      }
    },
  }
}

export const builds: SourceDeclaration = {
  name: sourceNameSchema.parse('demo.builds'),
  label: 'Builds',
  types: [
    {
      name: eventTypeNameSchema.parse('failed'),
      label: 'Build failed',
      description: 'A build failed.',
      kind: { kind: 'event' },
      subject: { presence: 'optional', hint: 'a repository' },
      subscribable: ['person', 'agent'],
      nameable: ['person', 'agent'],
      defaults: { person: 'strong', agent: 'off' },
      external: false,
    },
  ],
}

export function request(eventId: string, tenant: string = T1): SendRequestInput {
  return {
    identity: { tenant, source: 'demo.builds', eventId },
    event: {
      type: 'failed',
      subject: 'repo/a',
      at: '2026-11-18T06:00:00.000Z',
      content: { title: `Build ${eventId} failed`, body: `Details of ${eventId}`, locator: null },
      replaceKey: null,
      renotify: false,
      named: [],
      origin: null,
    },
  }
}

export const owner = (tenant: TenantId = T1): CallContext => ({
  tenant,
  subject: { owner: tenant },
  actor: { kind: 'owner' },
})

export type Opened = Awaited<ReturnType<typeof openApplication>>

/** One provider on real SQLite, with ports a test can steer and a probe channel for the person. */
export async function openApplication(
  options: {
    world?: SqlWorld
    policy?: unknown
    tenants?: readonly TenantId[] | null
    channel?: ChannelName | null
  } = {},
) {
  const world = options.world ?? (await openSqlWorld())
  const authority = fakeAuthority()
  const consent = fakeConsent()
  const standing = fakeStanding()
  const clock = fakeClock('2026-11-18T06:01:00.000Z')
  const manual = manualTimers()
  const reported: unknown[] = []
  const probeName =
    options.channel === undefined ? channelNameSchema.parse('probe') : options.channel
  const recipients =
    probeName === null
      ? policy().recipients
      : { person: { channel: probeName, minLevel: 'weak' as const }, agent: null }
  const sqlStore = createStoreOptions(world, options.tenants === undefined ? [T1] : options.tenants)
  const local: NotificationLocalOptions = {
    policy: options.policy ?? policy({ recipients }),
    sql: sqlStore,
    ports: { authority, consent, standing },
    clock,
    timers: manual.timers,
    report: error => void reported.push(error),
  }
  const application = await createNotificationLocalApplication(local)
  const probe = fakeChannel(probeName ?? 'probe')
  if (probeName !== null) application.channels.register(probe)
  application.sources.register(builds)
  const changes: unknown[] = []
  application.changes.subscribe(change => void changes.push(change))
  return {
    world,
    application,
    authority,
    consent,
    standing,
    clock,
    manual,
    reported,
    probe,
    changes,
    local,
  }
}

export function createStoreOptions(world: SqlWorld, tenants: readonly TenantId[] | null) {
  return {
    storage: world.storage,
    bind: world.bind,
    tenants: async () => tenants,
  }
}
