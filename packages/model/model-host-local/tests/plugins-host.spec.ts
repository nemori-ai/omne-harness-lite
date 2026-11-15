import { Context, Service, symbols } from '@deepseek-ai/cordis'
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
  decodeRevision,
  type FixedModelRequest,
  type ModelCallId,
  type ModelFailure,
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
import { describe, expect, it, vi } from 'vitest'
import { createModelRuntimeLocalPlugin } from '../src/cordis.ts'
import type { ModelHostPluginOptions } from '../src/plugins/host.ts'
import type { ModelObservationHost } from '@omne-harness/model/commands'
import { providerName } from './support/credentials.ts'

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

const SETTINGS = { concurrencyLimit: 2, wakeCapacity: 3, scanBatchSize: 10, scanIntervalMs: 250 }

async function until(check: () => boolean, label: string): Promise<void> {
  for (let tries = 0; tries < 400; tries += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`timed out waiting for ${label}`)
}

function commandsServiceOver(commands: ModelCommands<unknown>) {
  return class extends ModelCommandsService<unknown> {
    declare readonly admit: ModelCommands<unknown>['admit']
    declare readonly recall: ModelCommands<unknown>['recall']
    declare readonly scanPending: ModelCommands<unknown>['scanPending']
    declare readonly loadRecovery: ModelCommands<unknown>['loadRecovery']
    declare readonly loadRequest: ModelCommands<unknown>['loadRequest']
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
      provider: providerName('test.invalid'),
      model: 'test',
      credential: { layer: 'official' },
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
      unacknowledgedResults: 10,
    },
  }).commands
}

type Gate = { started: boolean; open: () => void; signalAborted: boolean; signalSeen: boolean }

function fixture(
  settings: Partial<typeof SETTINGS> = {},
  options: Partial<ModelHostPluginOptions> = {},
) {
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
    wait: (): Promise<'elapsed' | 'cancelled'> => Promise.resolve('elapsed'),
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
  const waits: string[] = []
  class Clock extends ModelClockService {
    readonly now = () => '2026-11-02T00:00:00.000Z'
    readonly waitUntil = (instant: string) => {
      waits.push(instant)
      return state.wait()
    }
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
    ...options,
  })
  const ctx = new Context()
  const errors: unknown[][] = []
  const messages: string[] = []
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
    waits,
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

it('rejects an observation pair from a different commands service before opening a lease', async () => {
  const openHost = vi.fn()
  const f = fixture(
    {},
    {
      observation: { commands: memoryCommands(), source: { openHost, close: vi.fn() } },
    },
  )
  expect(await loadError(f.load())).toBeInstanceOf(Error)
  expect(openHost).not.toHaveBeenCalled()
  expect(f.ctx.modelInstanceHost).toBeUndefined()
  expect(f.ctx.modelStreamReferences).toBeUndefined()
  expect(f.ctx.modelStreamObservation).toBeUndefined()
})

it('captures the private execution channel once and gives its commands to the provider', async () => {
  const commands = memoryCommands()
  const nextCommands = memoryCommands()
  let current = commands
  const executionChannel = vi.fn(() => ({
    ok: {
      commands: current,
      coordinator: null,
      prepare: vi.fn(),
      qualifyExecution: vi.fn(),
      close: vi.fn(),
    },
  }))
  let supplied: ModelCommands<unknown> | undefined
  const f = fixture(
    {},
    {
      executionChannel,
      releaseExecution: async () => {},
      provider: input => {
        supplied = input.commands
        return {
          driver: { drive: async () => ({ ok: undefined }) },
          quiesce: async () => ({ ok: { pending: '0', running: '0' } }),
        }
      },
    },
  )
  const fiber = await f.load()
  current = nextCommands
  expect(executionChannel).toHaveBeenCalledTimes(1)
  expect(supplied).toBe(commands)
  await fiber.dispose()
})

it('keeps both real observation services on one lease and closes it before an in-flight drive drains', async () => {
  const events: string[] = []
  const publications: unknown[] = []
  const retired: unknown[] = []
  const observation: ModelObservationHost<unknown> = {
    references: {
      current: vi.fn(
        async (): ReturnType<ModelObservationHost<unknown>['references']['current']> => ({
          failure: {
            kind: 'unavailable',
            dependency: 'test-source',
            diagnostic: 'no-confirmation',
          },
        }),
      ),
    },
    observation: { observe: vi.fn(() => (async function* () {})()) },
    attach: publication => {
      publications.push(publication)
    },
    retire: publication => {
      retired.push(publication)
    },
    close: () => {
      events.push('observation-close')
    },
  }
  const sourceClose = vi.fn()
  const openHost = vi.fn(() => ({ ok: observation }))
  let commands = memoryCommands()
  const f = fixture(
    {},
    {
      observation: {
        get commands() {
          return commands
        },
        source: { openHost, close: sourceClose },
      },
    },
  )
  await f.ctx.plugin(f.Authority)
  await f.ctx.plugin(f.Clock)
  await f.ctx.plugin(f.Commands)
  commands = Reflect.get(f.ctx.modelCommands, symbols.original)
  const fiber = await f.ctx.plugin(f.Plugin, SETTINGS)
  const host = f.ctx.modelInstanceHost
  expect(f.ctx.modelStreamReferences).toBeDefined()
  expect(f.ctx.modelStreamObservation).toBeDefined()
  const handle: ModelHandle<unknown> = {
    instance: instanceOf('lease'),
    observe: () => (async function* () {})(),
  }
  const execution = { ...wake('lease'), instance: handle.instance, generation: '1' }
  const first = unbox(await host.publish(execution, handle))
  const second = unbox(await host.publish({ ...execution, generation: '2' }, handle))
  expect(publications).toEqual([first, second])
  expect(await host.withdraw(first)).toEqual({ ok: { removed: false } })
  expect(retired).toEqual([])
  expect(await host.withdraw(second)).toEqual({ ok: { removed: true } })
  expect(retired).toEqual([second])
  await host.schedule(wake('drain'))
  await until(() => f.driven.length === 1, 'the in-flight drive')
  f.hooks.quiesce = async () => {
    events.push('quiesce')
    return { ok: { pending: '0', running: '1' } }
  }
  const unloading = fiber.dispose()
  await until(() => f.gateOf(callOf('drain')).signalAborted, 'the shutdown barrier')
  expect(events[0]).toBe('observation-close')
  expect(events[1]).toBe('quiesce')
  expect(openHost).toHaveBeenCalledTimes(1)
  expect(sourceClose).not.toHaveBeenCalled()
  f.gateOf(callOf('drain')).open()
  await unloading
  expect(f.ctx.modelStreamReferences).toBeUndefined()
  expect(f.ctx.modelStreamObservation).toBeUndefined()
})

it('requires the entry release owner before capturing a private execution channel', async () => {
  const executionChannel = vi.fn()
  const f = fixture({}, { executionChannel })
  expect(await loadError(f.load())).toBeInstanceOf(Error)
  expect(executionChannel).not.toHaveBeenCalled()
  expect(f.ctx.modelInstanceHost).toBeUndefined()
})

it('awaits the entry send child release after drive drain and before closing the channel', async () => {
  const events: string[] = []
  const closing = Promise.withResolvers<void>()
  const closeStarted = Promise.withResolvers<void>()
  const channel = {
    commands: memoryCommands(),
    coordinator: null,
    prepare: vi.fn(),
    qualifyExecution: vi.fn(),
    close: vi.fn(() => {
      events.push('channel-close')
    }),
  }
  let send: Awaited<ReturnType<Context['plugin']>> | undefined
  const releaseExecution = vi.fn(async () => {
    events.push('release-execution')
    await send?.dispose()
    channel.close()
  })
  const f = fixture({}, { executionChannel: () => ({ ok: channel }), releaseExecution })
  await f.ctx.plugin(f.Authority)
  await f.ctx.plugin(f.Clock)
  const parent = await f.ctx.plugin(f.Commands)
  send = await parent.ctx.plugin(child => {
    child.effect(() => async () => {
      events.push('send-close')
      closeStarted.resolve()
      await closing.promise
      events.push('send-closed')
    })
  })
  const host = await f.ctx.plugin(f.Plugin, SETTINGS)
  await f.ctx.modelInstanceHost.schedule(wake('release'))
  await until(() => f.driven.length === 1, 'the drive barrier')
  const unloading = host.dispose()
  await until(() => f.gateOf(callOf('release')).signalAborted, 'the drive abort')
  expect(releaseExecution).not.toHaveBeenCalled()
  expect(channel.close).not.toHaveBeenCalled()
  f.gateOf(callOf('release')).open()
  await closeStarted.promise
  expect(events).toEqual(['release-execution', 'send-close'])
  expect(f.ctx.modelCommands).toBeDefined()
  expect(channel.close).not.toHaveBeenCalled()
  closing.resolve()
  await unloading
  expect(events.slice(0, 4)).toEqual([
    'release-execution',
    'send-close',
    'send-closed',
    'channel-close',
  ])
  expect(releaseExecution).toHaveBeenCalledTimes(1)
  expect(channel.close).toHaveBeenCalled()
  await parent.dispose()
})

it('closes the channel and reports a safe diagnostic when the entry release fails', async () => {
  const close = vi.fn()
  const releaseExecution = vi.fn(async () => {
    throw new Error('secret-route-should-not-leak')
  })
  const f = fixture(
    {},
    {
      executionChannel: () => ({
        ok: {
          commands: memoryCommands(),
          coordinator: null,
          prepare: vi.fn(),
          qualifyExecution: vi.fn(),
          close,
        },
      }),
      releaseExecution,
    },
  )
  const host = await f.load()
  await host.dispose()
  expect(releaseExecution).toHaveBeenCalledTimes(1)
  expect(close).toHaveBeenCalledTimes(1)
  expect(f.messages.join('\n')).toContain('execution release failed')
  expect(f.messages.join('\n')).not.toContain('secret-route-should-not-leak')
})

const wake = (call: string) => ({ tenant: TENANT, call: callOf(call) })

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
  // Both fibers start before either settles, as a plugin tree loads: the consumer can see the
  // host only if the bind returned before the contribution was created.
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
    }),
  )
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
  expect(f.driven).toEqual([callOf('running')])
  expect(f.messages.some(line => line.includes('1 woken calls were not dispatched'))).toBe(true)
  expect(await host.schedule(wake('late'))).toMatchObject({
    failure: { kind: 'unavailable', diagnostic: 'host-closed' },
  })
})

describe('drain: the first half of a planned stop, while the callers are still alive', () => {
  async function loadInstance(
    f: ReturnType<typeof fixture>,
    overrides: Partial<typeof SETTINGS> = {},
  ) {
    await f.ctx.plugin(f.Authority)
    await f.ctx.plugin(f.Clock)
    await f.ctx.plugin(f.Commands)
    let instance: InstanceType<typeof f.Plugin> | undefined
    await f.ctx.plugin({
      name: 'keeps-the-instance',
      inject: f.Plugin.inject,
      apply(child: Context) {
        instance = new f.Plugin(child, { ...SETTINGS, ...overrides })
        return instance[Service.init]()
      },
    })
    if (instance === undefined) throw new Error('the plugin was not built')
    return instance
  }

  it('closes the admission first, then lets the drive in flight and the woken call run to their end without a stop signal', async () => {
    const f = fixture()
    const instance = await loadInstance(f, { concurrencyLimit: 1, wakeCapacity: 2 })
    const host = f.ctx.modelInstanceHost
    await host.schedule(wake('running'))
    await host.schedule(wake('queued'))
    await until(() => f.driven.length === 1, 'the running drive')

    let drained: unknown
    const draining = instance.drain(new AbortController().signal).then(answer => (drained = answer))
    await until(() => f.log.includes('quiesce'), 'the quiesce of the drain')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(drained).toBeUndefined()

    f.gateOf(callOf('running')).open()
    await until(() => f.driven.length === 2, 'the queued drive')
    expect(drained).toBeUndefined()
    f.gateOf(callOf('queued')).open()
    await draining

    expect(drained).toEqual({ quiesced: true, inFlight: 0 })
    expect(f.gateOf(callOf('running')).signalSeen).toBe(false)
    expect(f.gateOf(callOf('queued')).signalSeen).toBe(false)
    expect(await host.schedule(wake('late'))).toEqual({ ok: { queued: true } })
  })

  it('answers how many drives still run when the signal aborts, and aborts none of them', async () => {
    const f = fixture()
    const instance = await loadInstance(f)
    await f.ctx.modelInstanceHost.schedule(wake('slow'))
    await until(() => f.driven.length === 1, 'the drive')

    const expired = new AbortController()
    const draining = instance.drain(expired.signal)
    expired.abort()
    expect(await draining).toEqual({ quiesced: true, inFlight: 1 })
    expect(f.gateOf(callOf('slow')).signalAborted).toBe(false)
    f.gateOf(callOf('slow')).open()
  })

  it('answers at once when nothing is in flight', async () => {
    const f = fixture()
    const instance = await loadInstance(f)
    expect(await instance.drain(new AbortController().signal)).toEqual({
      quiesced: true,
      inFlight: 0,
    })
    expect(f.log).toEqual(['quiesce'])
  })

  it('says so when the runtime does not close its admission, and still waits for the drives', async () => {
    const f = fixture()
    const instance = await loadInstance(f)
    f.hooks.quiesce = async () => {
      throw new Error('the gate is stuck')
    }
    await f.ctx.modelInstanceHost.schedule(wake('a'))
    await until(() => f.driven.length === 1, 'the drive')
    const draining = instance.drain(new AbortController().signal)
    f.gateOf(callOf('a')).open()
    expect(await draining).toEqual({ quiesced: false, inFlight: 0 })
    expect(f.messages.some(line => line.includes('quiesce threw'))).toBe(true)
  })

  it('has nothing in flight before the plugin started', async () => {
    const f = fixture()
    const instance = new f.Plugin(f.ctx, { ...SETTINGS })
    expect(await instance.drain(new AbortController().signal)).toEqual({
      quiesced: true,
      inFlight: 0,
    })
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
    const rejected = await loadError(f.ctx.plugin(f.Plugin, { ...SETTINGS }))
    expect(rejected).toBeInstanceOf(Error)

    gate.open()
    await unloading
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(f.ctx.modelInstanceHost).toBeUndefined()

    await f.ctx.plugin(f.Plugin, { ...SETTINGS })
    expect(await f.ctx.modelInstanceHost.schedule(wake('b'))).toEqual({ ok: { queued: true } })
    await until(() => f.driven.length === 2, 'the drive of the reloaded host')
    f.gateOf(callOf('b')).open()
  })
})

describe('a drive that ended without ending the call', () => {
  function scripted(outcomes: Awaited<ReturnType<ModelDriver<unknown>['drive']>>[]) {
    const drives: string[] = []
    const f = fixture(
      {},
      {
        provider: () => ({
          driver: {
            drive: async input => {
              drives.push(input.call)
              return outcomes.shift() ?? { ok: undefined }
            },
          },
          quiesce: async () => ({ ok: { pending: '0', running: '0' } }),
        }),
      },
    )
    return { ...f, drives }
  }

  const again: ModelFailure[] = [
    { kind: 'unavailable', dependency: 'store', diagnostic: 'busy' },
    { kind: 'commit-unknown', operation: unbox(decodeModelOperationId('mop_lost')) },
    {
      kind: 'conflict',
      operation: unbox(decodeModelOperationId('mop_old')),
      revision: unbox(decodeRevision('7')),
    },
  ]
  const ended: ModelFailure[] = [
    { kind: 'invalid', field: 'facts', reason: 'refused' },
    { kind: 'stale-instance', instance: instanceOf('successor') },
    { kind: 'denied', action: 'execute' },
  ]
  for (const failure of again)
    it(`wakes the call again one pause after a drive that answered ${failure.kind}`, async () => {
      const f = scripted([{ failure }, { failure }])
      await f.load()
      await f.ctx.modelInstanceHost.schedule(wake('a'))
      await until(() => f.drives.length === 3, 'the third drive')
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(f.drives).toEqual([callOf('a'), callOf('a'), callOf('a')])
      expect(f.waits).toEqual(['2026-11-02T00:00:00.250Z', '2026-11-02T00:00:00.250Z'])
    })

  for (const failure of ended)
    it(`does not wake the call again after a drive that answered ${failure.kind}`, async () => {
      const f = scripted([{ failure }])
      await f.load()
      await f.ctx.modelInstanceHost.schedule(wake('a'))
      await until(() => f.drives.length === 1, 'the drive')
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(f.drives).toEqual([callOf('a')])
      expect(f.waits).toEqual([])
    })

  it('does not wake the call again once the host closes during the pause', async () => {
    const f = scripted([
      { failure: { kind: 'unavailable', dependency: 'store', diagnostic: 'busy' } },
    ])
    const pause = Promise.withResolvers<'elapsed'>()
    const fiber = await f.load()
    f.state.wait = () => pause.promise
    await f.ctx.modelInstanceHost.schedule(wake('a'))
    await until(() => f.drives.length === 1, 'the drive')
    await fiber.dispose()
    pause.resolve('elapsed')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(f.drives).toEqual([callOf('a')])
  })
})
