import { randomUUID } from 'node:crypto'
import { Service, symbols, type Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ModelLiveness, ModelRuntimeProvider } from '@omne-harness/model'
import {
  drivable,
  type ModelInitialExecution,
  type ModelObservationHost,
  type ModelObservationSource,
} from '@omne-harness/model/commands'
import type {
  CallAccess,
  DurableEvidence,
  ModelCallId,
  ModelFailure,
  ModelHandle,
  ModelRuntime,
  Reply,
} from '@omne-harness/model-contract'
import type {
  ModelBindingFailure,
  ModelClock,
  ModelCommands,
  ModelDriver,
  ModelDriverBinding,
  ModelDriverHost,
  ModelHostAuthority,
  ModelInstanceHost,
  Publication,
} from '@omne-harness/model-contract/provider'
import {
  ModelInstanceHostService,
  modelClockKey,
  modelCommandsKey,
  modelHostAuthorityKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { modelHostConfigSchema, type ModelHostSettings } from './config.ts'
import { whenEmpty } from './idle.ts'
import { createRuntimeStage, reportRuntimeEvent, type ResultPushOptions } from './runtime.ts'
import { createModelStreamLocalPlugin } from './stream-observation.ts'

const DEPENDENCY = 'model-instance-host'
const GENERATION = /^(0|[1-9][0-9]*)$/u

function unavailable(diagnostic: string): { failure: ModelFailure } {
  return { failure: { kind: 'unavailable', dependency: DEPENDENCY, diagnostic } }
}

type Wake = Readonly<{ tenant: TenantId; call: ModelCallId }>

export type HostEvent =
  | Readonly<{ kind: 'blocked'; failure: ModelFailure['kind'] }>
  | Readonly<{ kind: 'drive-failed'; failure: ModelFailure['kind'] }>
  | Readonly<{ kind: 'drive-threw' }>
  | Readonly<{ kind: 'handed-over'; undispatched: number }>

type HostInput = Readonly<{
  settings: Pick<ModelHostSettings, 'concurrencyLimit' | 'wakeCapacity' | 'scanIntervalMs'>
  authority: ModelHostAuthority<unknown>
  clock: ModelClock
  qualifyObservation: ModelHostPluginOptions['qualifyObservation']
  observation?: ModelObservationHost<unknown>
  report(event: HostEvent): void
}>

type Phase = 'unbound' | 'bound' | 'closing' | 'closed'

function keyOf(tenant: TenantId, call: ModelCallId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? JSON.stringify([text.value, call]) : undefined
}

type LocalDriverHost = ModelDriverHost<unknown> &
  Readonly<{
    retireRoute(target: Wake): void
    idle(signal: AbortSignal): Promise<number>
    drives(target: Wake): boolean
  }>

async function driveOnce(
  { authority, report }: Pick<HostInput, 'authority' | 'report'>,
  signal: AbortSignal,
  driver: ModelDriver<unknown>,
  target: Wake,
): Promise<boolean> {
  try {
    const resolved = await authority.resolve(target)
    if ('failure' in resolved) {
      report({ kind: 'blocked', failure: resolved.failure.kind })
      return false
    }
    if (signal.aborted) return false
    const outcome = await driver.drive(resolved.ok, signal)
    if ('ok' in outcome) return false
    report({ kind: 'drive-failed', failure: outcome.failure.kind })
    return drivable(outcome.failure)
  } catch {
    report({ kind: 'drive-threw' })
    return false
  }
}

function createLocalDriverHost(input: HostInput): LocalDriverHost {
  const { settings, clock, report } = input
  const wakes = new Map<string, Wake>()
  const owed = new Set<string>()
  const running = new Map<string, Promise<void>>()
  const routes = new Map<string, { publication: Publication; handle: ModelHandle<unknown> }>()
  const stopDrives = new AbortController()
  let phase: Phase = 'unbound'
  let bound: { driver: ModelDriver<unknown>; binding: ModelDriverBinding } | undefined
  let closing: Reply<void> | undefined
  const drive = (driver: ModelDriver<unknown>, target: Wake) =>
    driveOnce(input, stopDrives.signal, driver, target)

  async function wakeLater(key: string, target: Wake): Promise<void> {
    if (owed.has(key)) return
    owed.add(key)
    try {
      for (;;) {
        const instant = new Date(Date.parse(clock.now()) + settings.scanIntervalMs).toISOString()
        const waited = await clock.waitUntil(instant, stopDrives.signal)
        if (waited !== 'elapsed') return
        if (wakes.has(key) || wakes.size < settings.wakeCapacity) break
      }
      wakes.set(key, target)
    } catch {
    } finally {
      owed.delete(key)
    }
    pump()
  }

  function start(driver: ModelDriver<unknown>, key: string, target: Wake): void {
    const task = drive(driver, target).then(again => {
      running.delete(key)
      if (again) void wakeLater(key, target)
      pump()
    })
    running.set(key, task)
  }

  // A running key keeps its bit: the drive that runs now may already have read its state,
  // so the bit makes sure the call is looked at again after it returns.
  function pump(): void {
    if (phase !== 'bound' || bound === undefined) return
    for (const [key, target] of wakes) {
      if (running.size >= settings.concurrencyLimit) return
      if (running.has(key)) continue
      wakes.delete(key)
      start(bound.driver, key, target)
    }
  }

  async function closeNow(): Reply<void> {
    phase = 'closing'
    input.observation?.close()
    const undispatched = wakes.size
    wakes.clear()
    report({ kind: 'handed-over', undispatched })
    stopDrives.abort()
    await Promise.allSettled(running.values())
    routes.clear()
    phase = 'closed'
    return { ok: undefined }
  }

  const binding: ModelDriverBinding = {
    close: () => (closing ??= closeNow()),
  }

  function usable(): { failure: ModelFailure } | undefined {
    if (phase === 'bound') return undefined
    return unavailable(phase === 'unbound' ? 'not-bound' : 'host-closed')
  }

  return {
    idle: signal => whenEmpty(running, signal),
    drives(target) {
      const key = keyOf(target.tenant, target.call)
      return key !== undefined && (running.has(key) || wakes.has(key) || owed.has(key))
    },
    retireRoute(target) {
      const key = keyOf(target.tenant, target.call)
      const held = key === undefined ? undefined : routes.get(key)
      if (key === undefined || held === undefined) return
      input.observation?.retire(held.publication)
      routes.delete(key)
    },
    async bind(driver) {
      if (phase === 'closing' || phase === 'closed')
        return {
          failure: { kind: 'unavailable', dependency: DEPENDENCY, diagnostic: 'host-closed' },
        }
      if (typeof driver?.drive !== 'function')
        return { failure: { kind: 'invalid', field: 'driver', reason: 'drive-missing' } }
      if (bound !== undefined) {
        return bound.driver === driver
          ? { ok: bound.binding }
          : ({ failure: { kind: 'conflict' } } satisfies { failure: ModelBindingFailure })
      }
      bound = { driver, binding }
      phase = 'bound'
      return { ok: binding }
    },

    async schedule({ tenant, call }) {
      const refused = usable()
      if (refused) return refused
      const key = keyOf(tenant, call)
      if (key === undefined)
        return { failure: { kind: 'invalid', field: 'tenant', reason: 'invalid-identity' } }
      if (!wakes.has(key)) {
        if (wakes.size >= settings.wakeCapacity) return unavailable('queue-full')
        wakes.set(key, { tenant, call })
      }
      pump()
      return { ok: { queued: true } }
    },

    async publish(execution, handle) {
      const refused = usable()
      if (refused) return refused
      const key = keyOf(execution.tenant, execution.call)
      if (key === undefined)
        return { failure: { kind: 'invalid', field: 'execution', reason: 'invalid-identity' } }
      if (!GENERATION.test(execution.generation))
        return { failure: { kind: 'invalid', field: 'execution', reason: 'generation' } }
      if (handle.instance !== execution.instance)
        return { failure: { kind: 'invalid', field: 'handle', reason: 'instance' } }
      const held = routes.get(key)
      if (held !== undefined) {
        const same =
          held.handle === handle &&
          held.publication.execution.instance === execution.instance &&
          held.publication.execution.generation === execution.generation
        if (same) return { ok: held.publication }
        if (BigInt(execution.generation) <= BigInt(held.publication.execution.generation))
          return { failure: { kind: 'stale-instance', instance: execution.instance } }
      }
      const publication: Publication = Object.freeze({
        execution: Object.freeze({ ...execution }),
        registration: randomUUID(),
      })
      input.observation?.attach(publication)
      routes.set(key, { publication, handle })
      return { ok: publication }
    },

    async withdraw(publication) {
      if (phase === 'unbound') return unavailable('not-bound')
      const { execution, registration } = publication
      const key = keyOf(execution.tenant, execution.call)
      if (key === undefined)
        return { failure: { kind: 'invalid', field: 'execution', reason: 'invalid-identity' } }
      const held = routes.get(key)
      const removed =
        held !== undefined &&
        held.publication.registration === registration &&
        held.publication.execution.instance === execution.instance &&
        held.publication.execution.generation === execution.generation
      if (removed) {
        input.observation?.retire(held.publication)
        routes.delete(key)
      }
      return { ok: { removed } }
    },

    directory: {
      async connect(access: CallAccess<unknown>) {
        const refused = usable()
        if (refused) return refused
        const key = keyOf(access.tenant, access.call)
        if (key === undefined)
          return { failure: { kind: 'invalid', field: 'tenant', reason: 'invalid-identity' } }
        const qualified = await input.qualifyObservation(access)
        if ('failure' in qualified) return qualified
        const stillRefused = usable()
        if (stillRefused) return stillRefused
        const route = routes.get(key)
        return {
          ok: route ? { kind: 'live', handle: route.handle } : { kind: 'no-live-route' },
        }
      },
    },
  }
}

class HostContribution extends ModelInstanceHostService<unknown> {
  readonly schedule: ModelInstanceHost<unknown>['schedule']
  readonly publish: ModelInstanceHost<unknown>['publish']
  readonly withdraw: ModelInstanceHost<unknown>['withdraw']
  readonly directory: ModelInstanceHost<unknown>['directory']

  constructor(ctx: Context, host: ModelInstanceHost<unknown>) {
    super(ctx)
    this.schedule = input => host.schedule(input)
    this.publish = (execution, handle) => host.publish(execution, handle)
    this.withdraw = publication => host.withdraw(publication)
    this.directory = { connect: access => host.directory.connect(access) }
  }
}

export type ModelHostPluginOptions = Readonly<{
  executionChannel?(): ReturnType<ModelInitialExecution<unknown>['openHost']>
  releaseExecution?(): Promise<void>
  observation?: Readonly<{
    commands: ModelCommands<unknown>
    source: ModelObservationSource<unknown>
  }>
  provider(
    input: Readonly<{
      host: ModelInstanceHost<unknown>
      commands: ModelCommands<unknown>
      clock: ModelClock
      liveness: ModelLiveness
    }>,
  ): Pick<ModelRuntimeProvider<unknown>, 'driver' | 'quiesce'> &
    Partial<Pick<ModelRuntimeProvider<unknown>, 'released'>> &
    Readonly<{ runtime?: ModelRuntime<unknown> }>
  results?: ResultPushOptions
  qualifyObservation(access: CallAccess<unknown>): Reply<void>
  lostContact?(call: string): DurableEvidence | null
}>

export type ModelRuntimeLocalPluginInstance = Readonly<{
  [Service.init]: () => Promise<void>
  drain(signal: AbortSignal): Promise<ModelHostDrain>
}>

export type ModelHostDrain = Readonly<{ quiesced: boolean; inFlight: number }>

export type ModelRuntimeLocalPluginClass = {
  new (ctx: Context, settings: ModelHostSettings): ModelRuntimeLocalPluginInstance
  readonly inject: string[]
  readonly Config: typeof modelHostConfigSchema
}

type ExecutionChannel = Exclude<
  ReturnType<ModelInitialExecution<unknown>['openHost']>,
  { failure: unknown }
>['ok']

function assertStartOptions(ctx: Context, options: ModelHostPluginOptions): void {
  if (
    options.observation !== undefined &&
    options.observation.commands !== Reflect.get(ctx.modelCommands, symbols.original)
  )
    throw new TypeError('model host: observation commands do not match the injected service')
  if (options.executionChannel !== undefined && options.releaseExecution === undefined)
    throw new TypeError('model host: execution channel requires an entry release owner')
}

function captureExecutionChannel(options: ModelHostPluginOptions): ExecutionChannel | undefined {
  const captured = options.executionChannel?.()
  if (captured !== undefined && 'failure' in captured)
    throw new Error(`model host: execution channel unavailable (${captured.failure.kind})`)
  return captured?.ok
}

function createExecutionRelease(
  ctx: Context,
  options: ModelHostPluginOptions,
  channel: ExecutionChannel | undefined,
): () => Promise<void> {
  let releasing: Promise<void> | undefined
  return () => (releasing ??= releaseChannel())
  async function releaseChannel(): Promise<void> {
    if (channel === undefined) return
    try {
      await options.releaseExecution?.()
    } catch {
      ctx.logger.warn('model host: execution release failed')
    } finally {
      channel.close()
    }
  }
}

function openObservationHost(
  options: ModelHostPluginOptions,
): ModelObservationHost<unknown> | undefined {
  const lease = options.observation?.source.openHost()
  if (lease !== undefined && 'failure' in lease)
    throw new Error(`model host: observation lease unavailable (${lease.failure.kind})`)
  return lease?.ok
}

type BoundHostParts = Readonly<{
  host: ModelDriverHost<unknown>
  stage: ReturnType<typeof createRuntimeStage>
  provider: ReturnType<ModelHostPluginOptions['provider']>
  binding: ModelDriverBinding
  observation: ModelObservationHost<unknown> | undefined
  releaseExecution: () => Promise<void>
}>

async function publishBoundHost(ctx: Context, parts: BoundHostParts): Promise<void> {
  const { host, stage, provider, binding, observation, releaseExecution } = parts
  try {
    const contribution = ctx.plugin({
      name: 'model-runtime-local-contribution',
      apply: (child: Context) => {
        new HostContribution(child, host)
        stage.contribute(child, provider.runtime)
        if (observation !== undefined) createModelStreamLocalPlugin({ source: observation })(child)
      },
    })
    // The entry owns the send child on another fiber: await its release after drives and push
    // return, while the commands parent is still alive.
    ctx.effect(() => [
      contribution.dispose,
      async () => {
        try {
          await orderedShutdown(ctx, provider, binding, observation)()
          await stage.stop()
        } catch {
          ctx.logger.warn('model host: shutdown did not complete cleanly')
        } finally {
          await releaseExecution()
        }
      },
    ])
    await contribution
  } catch (error) {
    await binding.close()
    await stage.stop()
    throw error
  }
}

export function createModelRuntimeLocalPlugin(
  options: ModelHostPluginOptions,
): ModelRuntimeLocalPluginClass {
  async function start(
    ctx: Context,
    settings: ModelHostSettings,
    bound: (drain: ModelRuntimeLocalPluginInstance['drain']) => void,
  ): Promise<void> {
    assertStartOptions(ctx, options)
    const channel = captureExecutionChannel(options)
    const releaseExecution = createExecutionRelease(ctx, options, channel)
    let observation: ModelObservationHost<unknown> | undefined
    try {
      observation = openObservationHost(options)
      const host = createLocalDriverHost({
        settings,
        authority: ctx.modelHostAuthority,
        clock: ctx.modelClock,
        qualifyObservation: access => options.qualifyObservation(access),
        report: event => reportOf(ctx, event),
        ...(observation !== undefined && { observation }),
      })
      const stage = createRuntimeStage(
        {
          commands: channel?.commands ?? ctx.modelCommands,
          authority: ctx.modelHostAuthority,
          scanBatchSize: settings.scanBatchSize,
          clock: ctx.modelClock,
          report: event => reportRuntimeEvent(ctx, event),
          released: target => {
            host.retireRoute(target)
            provider.released?.(target)
          },
        },
        options.results,
      )
      const provider = options.provider({
        host,
        commands: stage.commands,
        clock: ctx.modelClock,
        liveness: {
          holds: target =>
            host.drives(target) ? 'drive' : stage.delivering(target) ? 'push' : null,
          lostContact: call => options.lostContact?.(call) ?? null,
        },
      })
      // The order is the guarantee: the host binds first, and only after the bind returns is the
      // contribution that publishes it created.
      const binding = await host.bind(provider.driver)
      if ('failure' in binding)
        throw new Error(`the model host could not bind: ${binding.failure.kind}`)
      bound(async signal => {
        const quiesced = await quiesceForDrain(ctx, provider)
        const drives = await host.idle(signal)
        const pushes = await stage.idle(signal)
        return { quiesced, inFlight: drives + pushes }
      })

      await publishBoundHost(ctx, {
        host,
        stage,
        provider,
        binding: binding.ok,
        observation,
        releaseExecution,
      })
    } catch (error) {
      observation?.close()
      await releaseExecution()
      throw error
    }
  }

  return class ModelRuntimeLocalPlugin {
    static readonly inject = [modelCommandsKey, modelClockKey, modelHostAuthorityKey]
    static readonly Config = modelHostConfigSchema

    declare readonly [Service.init]: () => Promise<void>

    declare readonly drain: ModelRuntimeLocalPluginInstance['drain']

    constructor(ctx: Context, settings: ModelHostSettings) {
      let drain: ModelRuntimeLocalPluginInstance['drain'] | undefined
      Object.defineProperty(this, Service.init, {
        value: () => start(ctx, settings, bound => (drain = bound)),
      })
      Object.defineProperty(this, 'drain', {
        value: (signal: AbortSignal) =>
          drain?.(signal) ?? Promise.resolve({ quiesced: true, inFlight: 0 }),
      })
    }
  }
}

async function quiesceForDrain(
  ctx: Context,
  provider: Pick<ModelRuntimeProvider<unknown>, 'quiesce'>,
): Promise<boolean> {
  try {
    const quiesced = await provider.quiesce()
    if ('ok' in quiesced) return true
    ctx.logger.warn(`model host: quiesce was refused (${quiesced.failure.kind})`)
  } catch {
    ctx.logger.warn('model host: quiesce threw')
  }
  return false
}

function orderedShutdown(
  ctx: Context,
  provider: Pick<ModelRuntimeProvider<unknown>, 'quiesce'>,
  binding: ModelDriverBinding,
  observation: ModelObservationHost<unknown> | undefined,
): () => Promise<void> {
  return async () => {
    observation?.close()
    try {
      const quiesced = await provider.quiesce()
      if ('failure' in quiesced)
        ctx.logger.warn(`model host: quiesce was refused (${quiesced.failure.kind})`)
    } catch {
      ctx.logger.warn('model host: quiesce threw')
    }
    try {
      const closed = await binding.close()
      if ('failure' in closed)
        ctx.logger.warn(`model host: the binding did not close (${closed.failure.kind})`)
    } catch {
      ctx.logger.warn('model host: closing the binding threw')
    }
  }
}

function reportOf(ctx: Context, event: HostEvent): void {
  switch (event.kind) {
    case 'blocked':
      ctx.logger.warn(`model host: a call was not driven, no trusted input (${event.failure})`)
      return
    case 'drive-failed':
      ctx.logger.warn(`model host: a drive ended with ${event.failure}`)
      return
    case 'drive-threw':
      ctx.logger.warn('model host: a drive threw')
      return
    case 'handed-over':
      if (event.undispatched > 0)
        ctx.logger.info(
          `model host: ${event.undispatched} woken calls were not dispatched and stay with the successor`,
        )
      return
  }
}
