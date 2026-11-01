// MD-04: the host part of `ModelRuntimeLocalPlugin`. It builds the local driver host, binds the
// driver of the runtime provider, and only then publishes `modelInstanceHost`. The runtime provider
// comes in through `options.provider`; the runtime stage of `./runtime.ts` gives it its commands
// and publishes `modelRuntime` next to the host, at the marked place in `ModelRuntimeLocalPlugin.start`.
//
// Three structural facts hold this file together:
// - The host object is built unbound, and the contribution that publishes it is created in the
//   same flow after `await host.bind(...)`. There is no earlier place that can name the service.
// - The contribution lives in its own child fiber, and one outer effect owns both the ordered
//   shutdown and that child. Cordis disposes the parts of one effect in reverse order, one after
//   the other, so the child (the published services) goes last, after quiesce and after every
//   drive was handed back. Separate top-level effects would be disposed together.
// - All scheduling state is in the closure of `createLocalDriverHost`. The service instance carries
//   the four operations of `ModelInstanceHost` and nothing else: `bind` stays with the plugin.
import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ModelRuntimeProvider } from '@omne-harness/model'
import type {
  CallAccess,
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
import { createRuntimeStage, reportRuntimeEvent, type ResultPushOptions } from './runtime.ts'

const DEPENDENCY = 'model-instance-host'
const GENERATION = /^(0|[1-9][0-9]*)$/u

function unavailable(diagnostic: string): { failure: ModelFailure } {
  return { failure: { kind: 'unavailable', dependency: DEPENDENCY, diagnostic } }
}

type Wake = Readonly<{ tenant: TenantId; call: ModelCallId }>

/** What the host reports to the plugin for a diagnostic: kinds and counts only, no identities. */
export type HostEvent =
  | Readonly<{ kind: 'blocked'; failure: ModelFailure['kind'] }>
  | Readonly<{ kind: 'drive-failed'; failure: ModelFailure['kind'] }>
  | Readonly<{ kind: 'drive-threw' }>
  | Readonly<{ kind: 'handed-over'; undispatched: number }>

type HostInput = Readonly<{
  settings: Pick<ModelHostSettings, 'concurrencyLimit' | 'wakeCapacity'>
  authority: ModelHostAuthority<unknown>
  /** The current observation qualification of the observer; see `ModelHostPluginOptions`. */
  qualifyObservation: ModelHostPluginOptions['qualifyObservation']
  report(event: HostEvent): void
}>

type Phase = 'unbound' | 'bound' | 'closing' | 'closed'

function keyOf(tenant: TenantId, call: ModelCallId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? JSON.stringify([text.value, call]) : undefined
}

/**
 * The local driver host. A wake is a bit per tenant and call: a repeated wake sets the bit that is
 * already set. At most `concurrencyLimit` drives run, each started by this host from its own
 * closure, never under a caller's context. Waiting work is a map of at most `wakeCapacity` keys,
 * so a full host refuses a wake and creates no promise for it. The durable pending work stays in
 * `ModelCommands`; nothing here marks it done.
 */
function createLocalDriverHost(input: HostInput): ModelDriverHost<unknown> {
  const { settings, authority, report } = input
  const wakes = new Map<string, Wake>()
  const running = new Map<string, Promise<void>>()
  const routes = new Map<string, { publication: Publication; handle: ModelHandle<unknown> }>()
  const stopDrives = new AbortController()
  let phase: Phase = 'unbound'
  let bound: { driver: ModelDriver<unknown>; binding: ModelDriverBinding } | undefined
  let closing: Reply<void> | undefined

  async function drive(driver: ModelDriver<unknown>, target: Wake): Promise<void> {
    try {
      const resolved = await authority.resolve(target)
      if ('failure' in resolved) {
        // No trusted input for this call, for example no evidence that the old process ended: the
        // call is not driven. Queries and custody are other services and stay available.
        report({ kind: 'blocked', failure: resolved.failure.kind })
        return
      }
      if (stopDrives.signal.aborted) return
      const outcome = await driver.drive(resolved.ok, stopDrives.signal)
      if ('failure' in outcome) report({ kind: 'drive-failed', failure: outcome.failure.kind })
    } catch {
      report({ kind: 'drive-threw' })
    }
  }

  function start(driver: ModelDriver<unknown>, key: string, target: Wake): void {
    // `drive` does not reject, so the chained promise needs no handler of its own.
    const task = drive(driver, target).finally(() => {
      running.delete(key)
      pump()
    })
    running.set(key, task)
  }

  // A key that is running keeps its bit and waits: the drive that runs now may already have read
  // its state, so the bit is what makes sure the call is looked at again after it returns.
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
    // What was woken but not yet dispatched is handed to the successor: it is durable in the
    // commands and the recovery scan finds it. It is not reported as done.
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
    async bind(driver) {
      if (phase === 'closing' || phase === 'closed')
        return {
          failure: { kind: 'unavailable', dependency: DEPENDENCY, diagnostic: 'host-closed' },
        }
      if (typeof driver?.drive !== 'function')
        return { failure: { kind: 'invalid', field: 'driver', reason: 'drive-missing' } }
      if (bound !== undefined) {
        // The same driver object is recognised; another one is a conflict.
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
        // Only a later generation replaces a route, so a late publication of an older instance
        // cannot take the route back from its successor.
        if (BigInt(execution.generation) <= BigInt(held.publication.execution.generation))
          return { failure: { kind: 'stale-instance', instance: execution.instance } }
      }
      const publication: Publication = Object.freeze({
        execution: Object.freeze({ ...execution }),
        registration: randomUUID(),
      })
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
      if (removed) routes.delete(key)
      return { ok: { removed } }
    },

    directory: {
      // The route table alone proves no right to observe: the observer's current qualification is
      // asked first, and its failure, `denied` included, is the answer.
      async connect(access: CallAccess<unknown>) {
        const refused = usable()
        if (refused) return refused
        const key = keyOf(access.tenant, access.call)
        if (key === undefined)
          return { failure: { kind: 'invalid', field: 'tenant', reason: 'invalid-identity' } }
        const qualified = await input.qualifyObservation(access)
        if ('failure' in qualified) return qualified
        // The host may have closed while the qualification was asked.
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

/** The contribution: the four operations of `ModelInstanceHost` and nothing else. */
class HostContribution extends ModelInstanceHostService<unknown> {
  // Cordis hands consumers the instance, so the host (with its `bind`) stays in this closure.
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

/**
 * What the plugin needs besides its injected services and its configuration. They are objects, not
 * serialisable values, so they come from the assembly that creates the plugin class.
 */
export type ModelHostPluginOptions = Readonly<{
  /**
   * Builds the runtime provider over the unbound host, the commands of the plugin and the injected
   * clock. The plugin binds its `driver` and calls its `quiesce` first when it shuts down. A
   * provider with a `runtime` gets `modelRuntime` published from it, and then `results` is needed.
   * Every write of the provider goes through the `commands` it is given: the result push learns of
   * committed settles and late accounts there.
   */
  provider(
    input: Readonly<{
      host: ModelInstanceHost<unknown>
      commands: ModelCommands<unknown>
      clock: ModelClock
    }>,
  ): Pick<ModelRuntimeProvider<unknown>, 'driver' | 'quiesce'> &
    Readonly<{ runtime?: ModelRuntime<unknown> }>
  /** The ledger and bounds of the result push. Required with a runtime, refused without one. */
  results?: ResultPushOptions
  /**
   * The observer's current right to observe the call. The design gives the host no injected source
   * for it, so the assembly supplies one. The directory returns a route only after it answers ok.
   */
  qualifyObservation(access: CallAccess<unknown>): Reply<void>
}>

/** The instance of the plugin class: Cordis calls `Service.init` and awaits it before ACTIVE. */
export type ModelRuntimeLocalPluginInstance = Readonly<{ [Service.init]: () => Promise<void> }>

export type ModelRuntimeLocalPluginClass = {
  new (ctx: Context, settings: ModelHostSettings): ModelRuntimeLocalPluginInstance
  readonly inject: string[]
  readonly Config: typeof modelHostConfigSchema
}

/**
 * The class that is the `ModelRuntimeLocalPlugin` of the design, for the host part. It is made by a
 * function because its two options are objects. The static `inject` is the design's: commands,
 * clock and host authority. `Config` carries the four bounds.
 */
export function createModelRuntimeLocalPlugin(
  options: ModelHostPluginOptions,
): ModelRuntimeLocalPluginClass {
  async function start(ctx: Context, settings: ModelHostSettings): Promise<void> {
    const host = createLocalDriverHost({
      settings,
      authority: ctx.modelHostAuthority,
      qualifyObservation: access => options.qualifyObservation(access),
      report: event => reportOf(ctx, event),
    })
    const stage = createRuntimeStage(
      {
        commands: ctx.modelCommands,
        authority: ctx.modelHostAuthority,
        report: event => reportRuntimeEvent(ctx, event),
      },
      options.results,
    )
    const provider = options.provider({
      host,
      commands: stage.commands,
      clock: ctx.modelClock,
    })
    // The order is the guarantee: the host was built unbound, it binds here, and only after the
    // bind has returned is the contribution that publishes it created.
    const bound = await host.bind(provider.driver)
    if ('failure' in bound) throw new Error(`the model host could not bind: ${bound.failure.kind}`)

    try {
      // The extension point of the runtime facade: `modelRuntime` is published in the same
      // contribution as the host, after the bind above and from `provider`. The contribution is
      // created inside this `try`: a fiber that unloads in the start window makes it throw, and the
      // bound host must then close.
      const contribution = ctx.plugin({
        name: 'model-runtime-local-contribution',
        apply: (child: Context) => {
          new HostContribution(child, host)
          stage.contribute(child, provider.runtime)
        },
      })
      // One outer effect owns the contribution, the push and the shutdown. They are disposed in
      // reverse order of this list, one after the other: the shutdown first, then the push, which
      // keeps its unfinished deliveries in its ledger for a successor, and the contribution last.
      ctx.effect(() => [contribution.dispose, stage.stop, orderedShutdown(ctx, provider, bound.ok)])
      await contribution
    } catch (error) {
      await bound.ok.close()
      throw error
    }
  }

  return class ModelRuntimeLocalPlugin {
    static readonly inject = [modelCommandsKey, modelClockKey, modelHostAuthorityKey]
    static readonly Config = modelHostConfigSchema

    // Cordis awaits this before the fiber is ACTIVE. It is set in the constructor, so that the
    // context and the settings live in a closure and not on the instance.
    declare readonly [Service.init]: () => Promise<void>

    constructor(ctx: Context, settings: ModelHostSettings) {
      Object.defineProperty(this, Service.init, { value: () => start(ctx, settings) })
    }
  }
}

/**
 * Quiesce, then stop dispatching and wait for every drive to hand back. It never rejects: the
 * disposers after it in the chain would not run if it did. A refused quiesce or a failed close is
 * reported, and shutdown goes on, so the unload ends; the report says what is still owed.
 */
function orderedShutdown(
  ctx: Context,
  provider: Pick<ModelRuntimeProvider<unknown>, 'quiesce'>,
  binding: ModelDriverBinding,
): () => Promise<void> {
  return async () => {
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
