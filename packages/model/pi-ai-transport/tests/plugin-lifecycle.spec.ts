import { Support, loadTransport } from './cordis-assembly.ts'
import { imagePreparation } from './image-transport-support.ts'
import { testDefinitions } from './definitions.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import {invokeModel} from '@omne-harness-lite/model-request-runtime-local'
import {type PlanInput, type StreamEnd} from '@omne-harness-lite/model-request-runtime'
import type { ArrivalEvent } from '@omne-harness-lite/arrival-events'
import {createModelTransportService} from '@omne-harness-lite/pi-ai-transport'
import {type AdaptationLease, type AdaptationRegistration, type ModelDefinition, type ModelTransportService} from '@omne-harness-lite/model-request-runtime'
import { type RetirementPolicy } from '@omne-harness-lite/model-request-runtime'
import { loadModelContribution as createModelPluginWithMeter } from './cordis-assembly.ts'
import { MODEL_TRANSPORT as MODEL_TRANSPORT_SERVICE } from '@omne-harness-lite/model-request-runtime/cordis'
import { piAiTransportPlugin } from '@omne-harness-lite/pi-ai-transport/cordis'
import {
  certificate,
  content,
  fixture,
  input,
  invocation,
  networkPolicy,
  policy,
} from './support.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'

function createModelPlugin(ctx: Context, definition: ModelDefinition, policy: RetirementPolicy) {
  return createModelPluginWithMeter(ctx, definition, syntheticInputMeter(definition, 'openai'), policy)
}

// Cordis 4.0.4 publishes these numeric FiberState values in its public declaration.
// The const enum has no JavaScript export for Vitest's isolated transpilation.
const fiberState = { pending: 0, active: 2, failed: 3, disposed: 4, unloading: 5 }

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(complete => {
    resolve = complete
  })
  return { promise, resolve }
}

function retirement(force = false, onDeadline = () => {}): RetirementPolicy {
  return {
    waitMilliseconds: 30,
    force,
    schedule(milliseconds, callback) {
      const timer = setTimeout(() => {
        onDeadline()
        callback()
      }, milliseconds)
      return () => clearTimeout(timer)
    },
  }
}

function firstDefinition(): ModelDefinition {
  const definition = testDefinitions[0]
  if (!definition) throw new Error('pilot definition missing')
  return definition
}

function nextDefinition(): ModelDefinition {
  const definition = firstDefinition()
  return { ...definition, revision: `${definition.revision}-next` }
}

function requestFor(definition: ModelDefinition): PlanInput {
  const request = input()
  return {
    ...request,
    routeName: definition.modelId,
    snapshot: {
      ...request.snapshot,
      adaptation: {
        ...request.snapshot.adaptation,
        implementation: definition.implementation,
        definition: { modelId: definition.modelId, revision: definition.revision },
      },
    },
  }
}

// Lookup is an unknown boundary. Check the public service shape without asserting a type.
function isModelTransportService(value: unknown): value is ModelTransportService {
  return (
    !!value &&
    typeof value === 'object' &&
    'registerAdaptation' in value &&
    typeof value.registerAdaptation === 'function' &&
    'acquire' in value &&
    typeof value.acquire === 'function' &&
    'retire' in value &&
    typeof value.retire === 'function' &&
    'close' in value &&
    typeof value.close === 'function' &&
    'closed' in value &&
    value.closed instanceof Promise &&
    'inspect' in value &&
    typeof value.inspect === 'function'
  )
}

function serviceOf(ctx: Context): ModelTransportService {
  const value: unknown = ctx.get(MODEL_TRANSPORT_SERVICE)
  if (!isModelTransportService(value)) throw new Error('model transport service unavailable')
  return value
}

function acquire(service: ModelTransportService, request: PlanInput): AdaptationLease {
  const result = service.acquire(request.snapshot.adaptation, request.routeName)
  if ('rejected' in result) throw new Error(`acquire rejected: ${result.rejected}`)
  return result.lease
}

function register(
  service: ModelTransportService,
  definition: ModelDefinition,
  owner: object,
  cleanup: () => void | Promise<void>,
): AdaptationRegistration {
  const result = service.registerAdaptation(
    definition,
    syntheticInputMeter(definition, 'openai'),
    owner,
    cleanup,
  )
  if ('rejected' in result) throw new Error(`registration rejected: ${result.rejected}`)
  return result.registered
}

async function consume(reader: AsyncGenerator<ArrivalEvent, StreamEnd>): Promise<StreamEnd> {
  while (true) {
    const next = await reader.next()
    if (next.done) return next.value
  }
}

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())

describe('actual Cordis 4.0.4 model contribution lifecycle', () => {
  it('missing stable service keeps a contribution pending; later provision activates it without false registration', async () => {
    const ctx = new Context()
    const contribution = createModelPlugin(ctx, firstDefinition(), retirement())
    try {
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(contribution.state).toBe(fiberState.pending)
      expect(ctx.get(MODEL_TRANSPORT_SERVICE)).toBeUndefined()
      const provider = loadTransport(ctx, {
        imagePreparation,
        policy: networkPolicy,
        retirement: retirement(),
      })
      await provider
      await contribution
      expect(provider.state).toBe(fiberState.active)
      expect(contribution.state).toBe(fiberState.active)
      expect(serviceOf(ctx).inspect().registrations).toBe(1)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('invalid base configuration fails its fiber and never provides the stable service', async () => {
    // Preserve the real plugin and its Config schema, while allowing malformed
    // external configuration to reach the runtime validation boundary.
    const pluginAtUnknownConfigBoundary: Plugin.Object<unknown> = piAiTransportPlugin
    const invalidConfigurations: readonly unknown[] = [
      { policy: { ...networkPolicy, maxConnections: 0 }, retirement: retirement() },
      { policy: networkPolicy },
      { policy: networkPolicy, retirement: { ...retirement(), waitMilliseconds: 0 } },
      { policy: networkPolicy, retirement: { waitMilliseconds: 30, force: false, schedule() {} } },
    ]
    for (const config of invalidConfigurations) {
      const ctx = new Context()
      try {
        new Support(ctx, { retirementSchedule: retirement().schedule })
        const provider = ctx.plugin(pluginAtUnknownConfigBoundary, config)
        await expect(Promise.resolve(provider)).rejects.toThrow(/invalid config/)
        expect(provider.state).toBe(fiberState.failed)
        expect(ctx.get(MODEL_TRANSPORT_SERVICE)).toBeUndefined()
      } finally {
        await ctx.fiber.dispose()
      }
    }
  })

  it('registering V2 preserves the stable service and does not rerun unrelated consumers or rebind old leases', async () => {
    const ctx = new Context()
    const leases: AdaptationLease[] = []
    let starts = 0,
      stops = 0
    const consumer: Plugin.Object = {
      name: 'model-transport-stability-consumer',
      inject: [MODEL_TRANSPORT_SERVICE],
      apply(consumerContext) {
        serviceOf(consumerContext)
        starts++
        consumerContext.effect(() => () => {
          stops++
        })
      },
    }
    try {
      const provider = loadTransport(ctx, {
        imagePreparation,
        policy: networkPolicy,
        retirement: retirement(),
      })
      await provider
      const stable = serviceOf(ctx)
      const unrelated = ctx.plugin(consumer)
      await unrelated
      const v1 = createModelPlugin(ctx, firstDefinition(), retirement())
      await v1
      const oldRequest = requestFor(firstDefinition())
      const oldLease = acquire(stable, oldRequest)
      leases.push(oldLease)
      const v2 = createModelPlugin(ctx, nextDefinition(), retirement())
      await v2
      const newRequest = requestFor(nextDefinition())
      const newLease = acquire(stable, newRequest)
      leases.push(newLease)
      // Cordis returns caller-tracked proxies. Both views must expose the same live registrations.
      expect(serviceOf(ctx).inspect()).toEqual(stable.inspect())
      expect(serviceOf(ctx).inspect().registrations).toBe(2)
      expect(provider.state).toBe(fiberState.active)
      expect(unrelated.state).toBe(fiberState.active)
      expect(starts).toBe(1)
      expect(stops).toBe(0)
      expect(stable.inspect().registrations).toBe(2)
      expect(oldLease.binding).toEqual(oldRequest.snapshot.adaptation)
      expect(newLease.binding).toEqual(newRequest.snapshot.adaptation)
      expect(
        await oldLease.transport.plan(newRequest, { signal: new AbortController().signal }),
      ).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      expect(
        await oldLease.transport.plan(oldRequest, { signal: new AbortController().signal }),
      ).toHaveProperty('planned')
    } finally {
      for (const lease of leases) lease.release()
      await ctx.fiber.dispose()
    }
    expect(stops).toBe(1)
  })

  it('after acquire A and an idle interval, lease B keeps retiring V1 alive while V2 remains available', async () => {
    const ctx = new Context()
    const leases: AdaptationLease[] = []
    let deadlines = 0,
      disposed = false
    let disposal: Promise<void> | undefined
    try {
      await loadTransport(ctx, {
        imagePreparation,
        policy: networkPolicy,
        retirement: retirement(),
      })
      const service = serviceOf(ctx)
      const v1 = createModelPlugin(ctx, firstDefinition(), retirement(false, () => {
            deadlines++
          }))
      await v1
      const oldRequest = requestFor(firstDefinition())
      const a = acquire(service, oldRequest)
      a.release()
      a.release()
      expect(service.inspect().references).toBe(0)
      await new Promise<void>(resolve => setImmediate(resolve))
      const b = acquire(service, oldRequest)
      leases.push(b)
      expect(service.inspect().references).toBe(1)
      const v2 = createModelPlugin(ctx, nextDefinition(), retirement())
      await v2
      disposal = v1.dispose().then(() => {
        disposed = true
      })
      await expect.poll(() => service.inspect().retiring).toBe(1)
      expect(service.acquire(oldRequest.snapshot.adaptation, oldRequest.routeName)).toEqual({
        rejected: 'unavailable',
      })
      expect(
        await b.transport.plan(oldRequest, { signal: new AbortController().signal }),
      ).toHaveProperty('planned')
      await expect.poll(() => deadlines).toBeGreaterThan(0)
      expect(disposed).toBe(false)
      expect(v1.state).toBe(fiberState.unloading)
      expect(service.inspect()).toMatchObject({ registrations: 2, retiring: 1, references: 1 })
      const current = acquire(service, requestFor(nextDefinition()))
      leases.push(current)
      b.release()
      b.release()
      await disposal
      expect(v1.state).toBe(fiberState.disposed)
      expect(service.inspect()).toMatchObject({ registrations: 1, references: 1 })
      expect(
        await current.transport.plan(requestFor(nextDefinition()), {
          signal: new AbortController().signal,
        }),
      ).toHaveProperty('planned')
    } finally {
      for (const lease of leases) lease.release()
      if (disposal) await disposal
      await ctx.fiber.dispose()
    }
  })
})

describe('public registry actual HTTPS execution ownership', () => {
  it('retirement timeout reports remaining work; completed historical retirement cannot remove a replacement contribution', async () => {
    const service = createModelTransportService({ imagePreparation, policy: networkPolicy })
    const cleanup = deferred()
    const leases: AdaptationLease[] = []
    let cleanups = 0
    try {
      const old = register(service, firstDefinition(), {}, () => {
        cleanups++
        return cleanup.promise
      })
      const lease = acquire(service, requestFor(firstDefinition()))
      leases.push(lease)
      expect(await service.retire(old, retirement())).toEqual({
        remaining_active: true,
        references: 1,
        executions: 0,
      })
      expect(cleanups).toBe(0)
      expect(
        await lease.transport.plan(requestFor(firstDefinition()), {
          signal: new AbortController().signal,
        }),
      ).toHaveProperty('planned')
      lease.release()
      await expect.poll(() => cleanups).toBe(1)
      expect(service.inspect().registrations).toBe(1)
      cleanup.resolve()
      expect(await service.retire(old, retirement())).toEqual({ retired: true })
      const replacement = register(service, firstDefinition(), {}, () => {
        cleanups++
      })
      const replacementLease = acquire(service, requestFor(firstDefinition()))
      leases.push(replacementLease)
      expect(await service.retire(old, retirement())).toEqual({ retired: true })
      expect(service.inspect()).toMatchObject({ registrations: 1, retiring: 0, references: 1 })
      expect(
        await replacementLease.transport.plan(requestFor(firstDefinition()), {
          signal: new AbortController().signal,
        }),
      ).toHaveProperty('planned')
      replacementLease.release()
      expect(await service.retire(replacement, retirement())).toEqual({ retired: true })
      expect(cleanups).toBe(2)
    } finally {
      cleanup.resolve()
      for (const lease of leases) lease.release()
      await service.close(retirement(true))
      await service.closed
    }
  })

  it('real Cordis forced contribution disposal stops both HTTPS consumers and waits for tracked callbacks', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(content('unapproved-content'))
    })
    const service = createModelTransportService(host.options)
    const ctx = new Context()
    const request = requestFor(firstDefinition())
    const direct = deferred(),
      gate = deferred()
    const leases: AdaptationLease[] = []
    let deadlines = 0,
      contributionDisposed = false,
      providerDisposed = false,
      gateEntered = false
    let disposal: Promise<void> | undefined
    try {
      // A trusted local assembly supplies the same public production registry
      // with explicit HTTPS fixture options. The production plugin endpoint
      // configuration remains unchanged; no replacement Cordis is involved.
      const localProvider: Plugin.Object = {
        name: 'local-https-model-transport-assembly',
        apply(providerContext) {
          providerContext.provide(MODEL_TRANSPORT_SERVICE, service)
          providerContext.effect(() => async () => {
            await service.close(retirement(true))
            await service.closed
            providerDisposed = true
          })
        },
      }
      await ctx.plugin(localProvider)
      const contribution = createModelPlugin(ctx, firstDefinition(), retirement(true, () => {
            deadlines++
          }))
      await contribution
      expect(serviceOf(ctx)).toBe(service)
      const directLease = acquire(service, request)
      leases.push(directLease)
      directLease.track(direct.promise)
      const planned = await directLease.transport.plan(request, {
        signal: new AbortController().signal,
      })
      if ('rejected' in planned) throw new Error('direct plan rejected')
      const cancellation = new AbortController()
      const sent = await directLease.transport.send(
        planned.planned,
        'fixture-test-secret',
        cancellation.signal,
      )
      if (!('response' in sent)) throw new Error('direct response unavailable')
      const directReading = consume(
        directLease.transport.read(sent.response, planned.planned, cancellation.signal),
      )
      const runtimeLease = acquire(service, request)
      leases.push(runtimeLease)
      runtimeLease.track(gate.promise)
      const handle = invokeModel({
        ...request,
        transport: runtimeLease.transport,
        credential: 'fixture-test-secret',
        signal: runtimeLease.signal,
        policy: policy(),
        beforeFirstContent: () => {
          gateEntered = true
          return gate.promise
        },
      })
      runtimeLease.track(handle.outcome)
      await expect.poll(() => gateEntered).toBe(true)
      expect(host.requests).toHaveLength(2)
      expect(host.closedSockets()).toBe(0)
      disposal = contribution.dispose().then(() => {
        contributionDisposed = true
      })
      await expect.poll(() => deadlines).toBeGreaterThan(0)
      expect(directLease.signal.aborted).toBe(true)
      expect(runtimeLease.signal.aborted).toBe(true)
      expect(await directReading).toHaveProperty('aborted', true)
      const result = invocation(await handle.outcome)
      expect(result.outcome).toBe('interrupted')
      expect(result.blocks).toEqual([])
      await expect.poll(host.closedSockets).toBe(2)
      directLease.release()
      runtimeLease.release()
      expect(service.inspect()).toMatchObject({
        registrations: 1,
        retiring: 1,
        references: 2,
        executions: 2,
      })
      expect(contributionDisposed).toBe(false)
      expect(providerDisposed).toBe(false)
      expect(contribution.state).toBe(fiberState.unloading)
      direct.resolve()
      gate.resolve()
      await disposal
      expect(contributionDisposed).toBe(true)
      expect(contribution.state).toBe(fiberState.disposed)
      expect(service.inspect()).toMatchObject({ registrations: 0, references: 0, executions: 0 })
      expect(host.requests).toHaveLength(2)
    } finally {
      direct.resolve()
      gate.resolve()
      for (const lease of leases) lease.release()
      if (disposal) await disposal
      await ctx.fiber.dispose()
      // Also releases the factory on any pre-provider initialization failure.
      await service.close(retirement(true))
      await service.closed
      await host.close()
    }
    expect(providerDisposed).toBe(true)
  })
})
