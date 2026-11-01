// The host part of `ModelRuntimeLocalPlugin` on real Cordis 4.0.4. Test objects stand in for what
// the assembly supplies: the host authority, the clock, the commands service (the in-memory
// ModelCommands from `@omne-harness/model/testing`, a store without durability), the runtime
// provider (here a driver and a quiesce that record what the host does to them) and the observer
// qualification. The real runtime provider joins when the runtime facade plugin does; until then
// nothing here proves a real driver.
import { Context } from '@deepseek-ai/cordis'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  type FixedModelRequest,
  type ModelCallId,
  type ModelHandle,
} from '@omne-harness/model-contract'
import type {
  ModelCommands,
  ModelDriveInput,
  ModelDriver,
  ModelInstanceHost,
} from '@omne-harness/model-contract/provider'
import {
  ModelClockService,
  ModelCommandsService,
  ModelHostAuthorityService,
  modelInstanceHostKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { describe, expect, it } from 'vitest'
import { createModelRuntimeLocalPlugin } from '../src/cordis.ts'

function unbox<T>(decoded: { ok: T } | { failure: unknown }): T {
  if ('ok' in decoded) return decoded.ok
  throw new Error(`fixture: ${JSON.stringify(decoded.failure)}`)
}

const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture identity')
const TENANT = tenant(organization.value, account.value)
const callOf = (name: string): ModelCallId => unbox(decodeModelCallId(`mcall_${name}`))
const instanceOf = (name: string) => unbox(decodeModelInstanceId(`minst_${name}`))
const evidence = { owner: 'host', record: 'r', revision: '1', digest: '1'.repeat(64) }

const SETTINGS = { concurrencyLimit: 2, wakeCapacity: 3, scanBatchSize: 10, scanIntervalMs: 0 }

async function until(check: () => boolean, label: string): Promise<void> {
  for (let tries = 0; tries < 400; tries += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${label}`)
}

// The commands service over the in-memory commands. Its fields are the commands' own functions.
function commandsServiceOver(commands: ModelCommands<unknown>) {
  return class extends ModelCommandsService<unknown> {
    declare readonly admit: ModelCommands<unknown>['admit']
    declare readonly recall: ModelCommands<unknown>['recall']
    declare readonly scanPending: ModelCommands<unknown>['scanPending']
    declare readonly loadRecovery: ModelCommands<unknown>['loadRecovery']
    declare readonly claim: ModelCommands<unknown>['claim']
    declare readonly prepareDispatch: ModelCommands<unknown>['prepareDispatch']
    declare readonly recordMaterialization: ModelCommands<unknown>['recordMaterialization']
    declare readonly recordSend: ModelCommands<unknown>['recordSend']
    declare readonly openReceiveWindow: ModelCommands<unknown>['openReceiveWindow']
    declare readonly preserve: ModelCommands<unknown>['preserve']
    declare readonly recordLateFact: ModelCommands<unknown>['recordLateFact']
    declare readonly prepareRetry: ModelCommands<unknown>['prepareRetry']
    declare readonly decideRetry: ModelCommands<unknown>['decideRetry']
    declare readonly settle: ModelCommands<unknown>['settle']
    declare readonly control: ModelCommands<unknown>['control']
    declare readonly acquireRead: ModelCommands<unknown>['acquireRead']
    declare readonly nextRead: ModelCommands<unknown>['nextRead']
    declare readonly endRead: ModelCommands<unknown>['endRead']
    declare readonly handoff: ModelCommands<unknown>['handoff']
    declare readonly advanceCleanup: ModelCommands<unknown>['advanceCleanup']
    declare readonly query: ModelCommands<unknown>['query']
    declare readonly dispatches: ModelCommands<unknown>['dispatches']
    constructor(ctx: Context) {
      super(ctx)
      Object.assign(this, commands)
    }
  }
}

const PRINCIPAL = Object.freeze({ subject: 'trusted' })
const principals = new WeakSet<object>([PRINCIPAL])
const request: FixedModelRequest = {
  profile: { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) },
  suppliers: [
    {
      adoption: { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) },
      recipient: 'test.invalid',
      model: 'test',
      credential: { kind: 'factory' },
    },
  ],
  fallback: false,
  retryPolicy: { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) },
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'test.invalid/test', accepts: ['test.invalid/test'], foreignThinking: 'omit' },
  ],
  representation: { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) },
  parameterAdoptions: [],
  source: { owner: 'o', name: 'n', revision: '1', digest: '0'.repeat(64) },
}

function memoryCommands() {
  const adoption = request.profile
  return createMemoryModelCommands<unknown>({
    owners: [{ consumerOwner: 'consumer', work: { kind: 'exempt' }, evidence: adoption }],
    authority: {
      authorize: ({ access, action }) =>
        typeof access.principal === 'object' &&
        access.principal !== null &&
        principals.has(access.principal)
          ? { ok: { owner: 'identity', subject: 'trusted', revision: '1' } }
          : { failure: { kind: 'denied', action } },
      execution: () => ({ ok: { owner: 'host', subject: 'channel', revision: '1' } }),
    },
    evidence: [
      {
        adoption,
        continuity: () => ({ ok: evidence }),
        materialization: () => ({ ok: evidence }),
        lateFact: () => ({ ok: evidence }),
        retry: () => ({ ok: evidence }),
        handoff: () => ({ ok: evidence }),
        receive: () => ({ failure: { kind: 'denied', action: 'receive' } }),
      },
    ],
    clock: { now: () => '2026-11-02T00:00:00.000Z' },
    limits: {
      scanPageCalls: 10,
      resultPageParts: 1,
      resultPageTargetBytes: 1024,
      readIdleMs: 1000,
      capacity: { bytes: '1000000', blocks: '1000', attachmentBytes: '1000000' },
    },
  }).commands
}

type Gate = { started: boolean; open: () => void; signalAborted: boolean; signalSeen: boolean }

// One fixture per test: the services the plugin injects, a driver that waits on a gate per call,
// and a log of what the host did.
function fixture(settings: Partial<typeof SETTINGS> = {}) {
  const log: string[] = []
  const gates = new Map<string, Gate & { release: PromiseWithResolvers<void> }>()
  const gateOf = (call: ModelCallId) => {
    const held = gates.get(call)
    if (held) return held
    const release = Promise.withResolvers<void>()
    const gate = {
      started: false,
      signalAborted: false,
      signalSeen: false,
      open: () => release.resolve(),
      release,
    }
    gates.set(call, gate)
    return gate
  }
  const state = {
    resolve: async (input: { tenant: TenantId; call: ModelCallId }) =>
      ({
        ok: {
          principal: PRINCIPAL,
          tenant: input.tenant,
          call: input.call,
          instance: instanceOf('one'),
          operation: unbox(decodeModelOperationId('mop_claim')),
          continuity: evidence,
        } satisfies ModelDriveInput<unknown>,
      }) as Awaited<ReturnType<ModelHostAuthorityService<unknown>['resolve']>>,
  }
  class Authority extends ModelHostAuthorityService<unknown> {
    readonly resolve = (input: { tenant: TenantId; call: ModelCallId }) => state.resolve(input)
  }
  class Clock extends ModelClockService {
    readonly now = () => '2026-11-02T00:00:00.000Z'
    readonly waitUntil = () => Promise.resolve('elapsed' as const)
  }
  const commands = memoryCommands()
  const Commands = commandsServiceOver(commands)
  const driven: string[] = []
  const driver: ModelDriver<unknown> = {
    drive: async (input, signal) => {
      const gate = gateOf(input.call)
      gate.started = true
      driven.push(input.call)
      signal.addEventListener('abort', () => (gate.signalAborted = true), { once: true })
      await gate.release.promise
      gate.signalSeen = signal.aborted
      return { ok: undefined }
    },
  }
  let qualification: 'ok' | 'denied' = 'ok'
  const hooks = {
    quiesce: async () => {
      log.push('quiesce')
      return { ok: { pending: '0', running: '0' } }
    },
  }
  const Plugin = createModelRuntimeLocalPlugin({
    provider: () => ({ driver, quiesce: () => hooks.quiesce() }),
    qualifyObservation: async () =>
      qualification === 'ok'
        ? { ok: undefined }
        : { failure: { kind: 'denied', action: 'observe' } },
  })
  const ctx = new Context()
  const errors: unknown[][] = []
  const messages: string[] = []
  // Cordis ranks warn above info and drops what ranks above the exporter level, so the level is
  // raised to see the warnings of the host.
  ctx.logger.exporter({
    colors: 0,
    levels: { default: 3 },
    export: message => {
      if (message.type === 'error') errors.push(message.args)
      messages.push(message.args.map(String).join(' '))
    },
  })
  return {
    ctx,
    log,
    driven,
    gateOf,
    state,
    commands,
    errors,
    messages,
    hooks,
    Authority,
    Clock,
    Commands,
    Plugin,
    driver,
    qualify: (value: 'ok' | 'denied') => {
      qualification = value
    },
    async load(overrides: Partial<typeof SETTINGS> = settings) {
      await ctx.plugin(Authority)
      await ctx.plugin(Clock)
      await ctx.plugin(Commands)
      return ctx.plugin(Plugin, { ...SETTINGS, ...overrides })
    },
  }
}

const wake = (call: string) => ({ tenant: TENANT, call: callOf(call) })

// Cordis fibers are thenables that Vitest's matchers probe as injected values, so wrap the await.
async function loadError(fiber: PromiseLike<unknown>): Promise<unknown> {
  try {
    await fiber
    return undefined
  } catch (error) {
    return error
  }
}

it('publishes modelInstanceHost only after the bind has returned: a consumer that loads with it can schedule', async () => {
  const f = fixture()
  const answers: unknown[] = []
  await f.ctx.plugin(f.Authority)
  await f.ctx.plugin(f.Clock)
  await f.ctx.plugin(f.Commands)
  // Both fibers are started before either settles, the way a plugin tree loads its rows. That the
  // consumer still sees the host can then only come from the bind having returned before the
  // contribution was created: a contribution made earlier is published to both at once.
  const host = f.ctx.plugin(f.Plugin, { ...SETTINGS })
  const consumer = f.ctx.plugin({
    inject: [modelInstanceHostKey],
    apply: async inner => {
      answers.push(await inner.modelInstanceHost.schedule(wake('first')))
    },
  })
  await Promise.all([host, consumer])
  expect(answers).toEqual([{ ok: { queued: true } }])
  await until(() => f.driven.length === 1, 'the first drive')
  f.gateOf(callOf('first')).open()
})

it('fails to load when a bound is missing or out of range, and gives no number a default', async () => {
  const bad: readonly [string, unknown][] = [
    ['no configuration', undefined],
    ['no concurrencyLimit', { ...SETTINGS, concurrencyLimit: undefined }],
    ['a zero concurrencyLimit', { ...SETTINGS, concurrencyLimit: 0 }],
    ['a fractional wakeCapacity', { ...SETTINGS, wakeCapacity: 1.5 }],
    ['no wakeCapacity', { ...SETTINGS, wakeCapacity: undefined }],
    ['a negative scanBatchSize', { ...SETTINGS, scanBatchSize: -1 }],
    ['no scanIntervalMs', { ...SETTINGS, scanIntervalMs: undefined }],
    ['a negative scanIntervalMs', { ...SETTINGS, scanIntervalMs: -5 }],
    ['an infinite scanIntervalMs', { ...SETTINGS, scanIntervalMs: Infinity }],
  ]
  for (const [name, config] of bad) {
    const f = fixture()
    await f.ctx.plugin(f.Authority)
    await f.ctx.plugin(f.Clock)
    await f.ctx.plugin(f.Commands)
    // The values are wrong on purpose: the cast only lets them through the type of the class.
    const invalid = config as typeof SETTINGS
    expect(await loadError(f.ctx.plugin(f.Plugin, invalid)), name).toBeInstanceOf(Error)
    expect(f.ctx.modelInstanceHost, name).toBeUndefined()
  }
})

it('runs at most the concurrency limit of drives and starts the next one when one hands back', async () => {
  const f = fixture({ concurrencyLimit: 2, wakeCapacity: 5 })
  await f.load()
  const host = f.ctx.modelInstanceHost
  for (const name of ['a', 'b', 'c'])
    expect(await host.schedule(wake(name))).toEqual({ ok: { queued: true } })
  await until(() => f.driven.length === 2, 'two drives')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(f.driven).toEqual([callOf('a'), callOf('b')])

  f.gateOf(callOf('a')).open()
  await until(() => f.driven.length === 3, 'the third drive')
  expect(f.driven[2]).toBe(callOf('c'))
  f.gateOf(callOf('b')).open()
  f.gateOf(callOf('c')).open()
})

it('refuses a wake when the wake capacity is full and does not drive the refused call later', async () => {
  const f = fixture({ concurrencyLimit: 1, wakeCapacity: 1 })
  await f.load()
  const host = f.ctx.modelInstanceHost
  expect(await host.schedule(wake('a'))).toEqual({ ok: { queued: true } })
  await until(() => f.driven.length === 1, 'the first drive')
  expect(await host.schedule(wake('b'))).toEqual({ ok: { queued: true } })
  const refused = await host.schedule(wake('c'))
  expect(refused).toMatchObject({ failure: { kind: 'unavailable', diagnostic: 'queue-full' } })

  f.gateOf(callOf('a')).open()
  await until(() => f.driven.length === 2, 'the second drive')
  f.gateOf(callOf('b')).open()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(f.driven).toEqual([callOf('a'), callOf('b')])
})

it('merges repeated wakes of one call into one bit, also while the call is running', async () => {
  const f = fixture({ concurrencyLimit: 2, wakeCapacity: 2 })
  await f.load()
  const host = f.ctx.modelInstanceHost
  await host.schedule(wake('a'))
  await until(() => f.driven.length === 1, 'the first drive')
  // Three wakes while it runs set one bit, and a full capacity of one still takes the first.
  for (let n = 0; n < 3; n += 1)
    expect(await host.schedule(wake('a'))).toEqual({ ok: { queued: true } })

  f.gateOf(callOf('a')).open()
  await until(() => f.driven.length === 2, 'the second drive of the same call')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(f.driven).toEqual([callOf('a'), callOf('a')])
  f.gateOf(callOf('a')).open()
})

it('answers a wake with a tenant that did not come from the identity parser as invalid', async () => {
  const f = fixture()
  await f.load()
  const answer = await f.ctx.modelInstanceHost.schedule({
    tenant: { ...TENANT },
    call: callOf('a'),
  })
  expect(answer).toMatchObject({ failure: { kind: 'invalid', field: 'tenant' } })
  expect(f.driven).toEqual([])
})

it('does not stop an autonomous drive when the fiber of the caller that woke it ends', async () => {
  const f = fixture()
  await f.load()
  const caller = await f.ctx.plugin({
    inject: [modelInstanceHostKey],
    apply: async inner => {
      await inner.modelInstanceHost.schedule(wake('a'))
    },
  })
  await until(() => f.driven.length === 1, 'the drive')
  await caller.dispose()

  const gate = f.gateOf(callOf('a'))
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(gate.signalAborted).toBe(false)
  gate.open()
  await until(() => gate.signalSeen === false && gate.started, 'the drive to return')
  expect(f.errors).toEqual([])
})

it('does not drive a call without trusted input, and the durable pending work stays in the commands', async () => {
  const f = fixture()
  await f.load()
  const call = callOf('pending')
  unbox(
    await f.commands.admit({
      principal: PRINCIPAL,
      tenant: TENANT,
      call,
      operation: unbox(decodeModelOperationId('mop_admit')),
      request,
      consumer: { owner: 'consumer', work: 'work', position: 'position', purpose: 'test' },
      capacity: { bytes: '100000', blocks: '100', attachmentBytes: '100000' },
    }),
  )
  // The restarted process cannot show that the old one ended: the authority has no input to give.
  f.state.resolve = async () => ({
    failure: {
      kind: 'unavailable',
      dependency: 'host-authority',
      diagnostic: 'no-termination-evidence',
    },
  })
  expect(await f.ctx.modelInstanceHost.schedule({ tenant: TENANT, call })).toEqual({
    ok: { queued: true },
  })
  await until(() => f.messages.some(line => line.includes('no trusted input')), 'the report')
  expect(f.driven).toEqual([])

  const scanned = await f.ctx.modelCommands.scanPending({
    principal: PRINCIPAL,
    tenant: TENANT,
    after: null,
    limit: 10,
  })
  expect(scanned).toEqual({ ok: { calls: [call], next: null } })
  const lookup = await f.ctx.modelCommands.loadRecovery({
    principal: PRINCIPAL,
    tenant: TENANT,
    call,
  })
  expect('ok' in lookup).toBe(true)
})

it('shuts down in order: quiesce, then stop dispatching and wait for the drives, then withdraw the services', async () => {
  const f = fixture({ concurrencyLimit: 1, wakeCapacity: 2 })
  const fiber = await f.load()
  const host = f.ctx.modelInstanceHost
  await host.schedule(wake('running'))
  await host.schedule(wake('queued'))
  await until(() => f.driven.length === 1, 'the running drive')

  f.hooks.quiesce = async () => {
    f.log.push(`quiesce (service ${f.ctx.modelInstanceHost ? 'present' : 'gone'})`)
    return { ok: { pending: '1', running: '1' } }
  }
  const gate = f.gateOf(callOf('running'))
  const unloading = fiber.dispose()
  await until(() => gate.signalAborted, 'the stop signal of the drive')
  f.log.push(`dispatch stopped (service ${f.ctx.modelInstanceHost ? 'present' : 'gone'})`)
  await new Promise(resolve => setTimeout(resolve, 20))
  // The drive has not handed back, so the unload has not finished and the service is still there.
  f.log.push(`waiting (service ${f.ctx.modelInstanceHost ? 'present' : 'gone'})`)
  gate.open()
  await unloading
  f.log.push(`unloaded (service ${f.ctx.modelInstanceHost ? 'present' : 'gone'})`)

  expect(f.log).toEqual([
    'quiesce (service present)',
    'dispatch stopped (service present)',
    'waiting (service present)',
    'unloaded (service gone)',
  ])
  // What was woken but not dispatched stays with the successor: it was never driven, and the host
  // says so without calling it done.
  expect(f.driven).toEqual([callOf('running')])
  expect(f.messages.some(line => line.includes('1 woken calls were not dispatched'))).toBe(true)
  expect(await host.schedule(wake('late'))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'host-closed' },
  })
})

it('keeps the host that a consumer holds from reaching a successor, and the drive in flight on its own driver', async () => {
  const f = fixture({ concurrencyLimit: 1, wakeCapacity: 2 })
  const first = await f.load()
  const old = f.ctx.modelInstanceHost
  await old.schedule(wake('a'))
  await until(() => f.driven.length === 1, 'the first drive')

  const unloading = first.dispose()
  const gate = f.gateOf(callOf('a'))
  await until(() => gate.signalAborted, 'the old host to stop dispatching')
  gate.open()
  await unloading
  const successor = await f.ctx.plugin(f.Plugin, { ...SETTINGS })
  expect(successor).toBeDefined()
  expect(f.ctx.modelInstanceHost).not.toBe(old)

  // The old reference answers for the old host: closed. It does not forward to the new one.
  expect(await old.schedule(wake('b'))).toMatchObject({ failure: { diagnostic: 'host-closed' } })
  expect(f.driven).toEqual([callOf('a')])
  expect(await f.ctx.modelInstanceHost.schedule(wake('b'))).toEqual({ ok: { queued: true } })
  await until(() => f.driven.length === 2, 'the successor drive')
})

it('unloads the host with a lost dependency and answers unavailable through the old reference', async () => {
  const f = fixture()
  const authority = await f.ctx.plugin(f.Authority)
  await f.ctx.plugin(f.Clock)
  await f.ctx.plugin(f.Commands)
  await f.ctx.plugin(f.Plugin, { ...SETTINGS })
  const old = f.ctx.modelInstanceHost

  await authority.dispose()
  await until(() => f.ctx.modelInstanceHost === undefined, 'the host to unload')
  expect(await old.schedule(wake('a'))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'host-closed' },
  })
  expect(f.log).toEqual(['quiesce'])
})

it('closes the bound host and publishes nothing when the fiber unloads while it starts', async () => {
  const f = fixture()
  await f.ctx.plugin(f.Authority)
  await f.ctx.plugin(f.Clock)
  await f.ctx.plugin(f.Commands)
  let fiber: ReturnType<Context['plugin']> | undefined
  let built: ModelInstanceHost<unknown> | undefined
  // The provider runs inside the start, before the bind: the unload lands in that window.
  const Plugin = createModelRuntimeLocalPlugin({
    provider: input => {
      built = input.host
      void fiber?.dispose()
      return { driver: f.driver, quiesce: () => f.hooks.quiesce() }
    },
    qualifyObservation: async () => ({ ok: undefined }),
  })
  fiber = f.ctx.plugin(Plugin, { ...SETTINGS })
  await loadError(fiber)
  await new Promise(resolve => setTimeout(resolve, 20))

  expect(f.ctx.modelInstanceHost).toBeUndefined()
  if (built === undefined) throw new Error('the provider was not called')
  expect(await built.schedule(wake('a'))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'host-closed' },
  })
  expect(f.driven).toEqual([])
})

it('serves a route only to an observer that is currently qualified, and only a later generation replaces it', async () => {
  const f = fixture()
  await f.load()
  const host = f.ctx.modelInstanceHost
  const handle = (name: string): ModelHandle<unknown> => ({
    instance: instanceOf(name),
    observe: () => (async function* () {})(),
  })
  const first = handle('one')
  const execution = (name: string, generation: string) => ({
    tenant: TENANT,
    call: callOf('a'),
    instance: instanceOf(name),
    generation,
  })
  const observer = { principal: PRINCIPAL, tenant: TENANT, call: callOf('a') }

  const published = await host.publish(execution('one', '1'), first)
  if (!('ok' in published)) throw new Error('publish failed')
  expect(await host.publish(execution('one', '1'), first)).toEqual({ ok: published.ok })
  expect(await host.directory.connect(observer)).toEqual({ ok: { kind: 'live', handle: first } })

  f.qualify('denied')
  expect(await host.directory.connect(observer)).toEqual({
    failure: { kind: 'denied', action: 'observe' },
  })
  f.qualify('ok')

  expect(await host.publish(execution('two', '1'), handle('two'))).toMatchObject({
    failure: { kind: 'stale-instance' },
  })
  const second = handle('two')
  expect(await host.publish(execution('two', '2'), second)).toMatchObject({ ok: {} })
  expect(await host.directory.connect(observer)).toEqual({ ok: { kind: 'live', handle: second } })
  // The registration of the replaced route no longer removes anything.
  expect(await host.withdraw(published.ok)).toEqual({ ok: { removed: false } })
  expect(await host.directory.connect(observer)).toEqual({ ok: { kind: 'live', handle: second } })
})

describe('what the host keeps apart, and what it refuses to share', () => {
  const otherAccount = accountCodec.parse('acc_bcdefghjkmnpqrstvwxyz2345a')
  if (!otherAccount.ok) throw new Error('fixture identity')
  const OTHER = tenant(organization.value, otherAccount.value)

  it('keeps the wakes of two tenants for one call id apart: each is driven for its own tenant', async () => {
    const f = fixture({ concurrencyLimit: 2, wakeCapacity: 3 })
    await f.load()
    const resolvedFor: TenantId[] = []
    const resolve = f.state.resolve
    f.state.resolve = input => {
      resolvedFor.push(input.tenant)
      return resolve(input)
    }
    const host = f.ctx.modelInstanceHost
    const call = callOf('shared')
    expect(await host.schedule({ tenant: TENANT, call })).toEqual({ ok: { queued: true } })
    expect(await host.schedule({ tenant: OTHER, call })).toEqual({ ok: { queued: true } })

    // The first drive is still running, so a wake that merged with it would wait and not start.
    await until(() => f.driven.length === 2, 'one drive for each tenant')
    expect(resolvedFor).toHaveLength(2)
    expect(resolvedFor).toContainEqual(TENANT)
    expect(resolvedFor).toContainEqual(OTHER)
    f.gateOf(call).open()
  })

  it('takes a repeated wake of a call that already waits when the queue is full, and refuses a new call', async () => {
    const f = fixture({ concurrencyLimit: 1, wakeCapacity: 1 })
    await f.load()
    const host = f.ctx.modelInstanceHost
    await host.schedule(wake('a'))
    await until(() => f.driven.length === 1, 'the first drive')
    expect(await host.schedule(wake('b'))).toEqual({ ok: { queued: true } })
    // The queue holds b and is full: b again sets the bit that is set, a new call c has no room.
    expect(await host.schedule(wake('b'))).toEqual({ ok: { queued: true } })
    expect(await host.schedule(wake('c'))).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'queue-full' },
    })

    f.gateOf(callOf('a')).open()
    await until(() => f.driven.length === 2, 'the drive of b')
    f.gateOf(callOf('b')).open()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(f.driven).toEqual([callOf('a'), callOf('b')])
  })

  it('fails a successor that loads while the old host still drains, and leaves no host after the old unload (known limit: one provider per service key)', async () => {
    const f = fixture({ concurrencyLimit: 1, wakeCapacity: 2 })
    const first = await f.load()
    await f.ctx.modelInstanceHost.schedule(wake('a'))
    await until(() => f.driven.length === 1, 'the drive')
    const gate = f.gateOf(callOf('a'))

    const unloading = first.dispose()
    await until(() => gate.signalAborted, 'the old host to stop dispatching')
    // The old host still waits for its drive, so its service key is still taken.
    const rejected = await loadError(f.ctx.plugin(f.Plugin, { ...SETTINGS }))
    expect(rejected).toBeInstanceOf(Error)

    gate.open()
    await unloading
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(f.ctx.modelInstanceHost).toBeUndefined()

    // The way out is to wait for the old host to leave and load again.
    await f.ctx.plugin(f.Plugin, { ...SETTINGS })
    expect(await f.ctx.modelInstanceHost.schedule(wake('b'))).toEqual({ ok: { queued: true } })
    await until(() => f.driven.length === 2, 'the drive of the reloaded host')
    f.gateOf(callOf('b')).open()
  })
})
