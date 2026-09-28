import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invokeModel } from '@omne-harness-lite/model-request-runtime'
import {
  createModelTransportService,
  type AdaptationLease,
  type ModelDefinition,
  type ModelTransportService,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  certificate,
  content,
  finish,
  fixture,
  input,
  invocation,
  networkPolicy,
  policy,
} from './support.ts'

let cert: ReturnType<typeof certificate>
beforeAll(() => {
  cert = certificate()
})
afterAll(() => cert.dispose())
const wait: RetirementPolicy = {
  waitMilliseconds: 30,
  force: false,
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  },
}
function definition(anthropic = false): ModelDefinition {
  const found = testDefinitions[anthropic ? 1 : 0]
  if (!found) throw new Error('missing pilot')
  return found
}
function register(service: ModelTransportService, value = definition(), cleanup = () => {}) {
  const provider = Object.keys(value.routes)[0]
  if (!provider) throw new Error('fixture route missing')
  const result = service.registerAdaptation(
    value,
    syntheticInputMeter(value, provider),
    {},
    cleanup,
  )
  if ('rejected' in result) throw new Error('valid contribution rejected')
  return result.registered
}
function acquire(service: ModelTransportService, request = input()): AdaptationLease {
  const result = service.acquire(request.snapshot.adaptation, request.routeName)
  if ('rejected' in result) throw new Error('valid binding rejected')
  return result.lease
}
describe('production adaptation ownership', () => {
  it('isolates malformed diagnostic thenables without retaining phantom pending work', async () => {
    const host = await fixture(cert.tls, res => res.end(content('ok') + finish()))
    const service = createModelTransportService({
      ...host.options,
      onDiagnostic: () => ({ then: 1 }) as never,
    })
    register(service)
    const lease = acquire(service)
    const handle = invokeModel({
      ...input(),
      transport: lease.transport,
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
    })
    try {
      expect(invocation(await handle.outcome).outcome).toBe('complete')
      expect(host.requests).toHaveLength(1)
      expect(service.diagnostics()).toEqual({ failed: 1, pending: 0, dropped: 0 })
    } finally {
      handle.abort()
      lease.release()
      await service.close({ ...wait, force: true })
      await host.close()
    }
  })

  it('reads the same network diagnostic health through retirement and close without a lease', async () => {
    const host = await fixture(cert.tls, res => res.end(content('ok') + finish()))
    let rejectDelivery: (reason?: unknown) => void = () => {}
    const service = createModelTransportService({
      ...host.options,
      policy: { ...host.options.policy, maxConnections: 1 },
      onDiagnostic: () =>
        new Promise<void>((_, reject) => {
          rejectDelivery = reject
        }),
    })
    const registration = register(service)
    const lease = acquire(service)
    const handle = invokeModel({
      ...input(),
      transport: lease.transport,
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
    })
    const second = invokeModel({
      ...input(),
      transport: lease.transport,
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
    })
    try {
      expect(invocation(await handle.outcome).outcome).toBe('complete')
      expect(invocation(await second.outcome).outcome).toBe('complete')
      expect(host.requests).toHaveLength(2)
      const active = service.diagnostics()
      expect(active.pending).toBe(1)
      expect(active.dropped).toBeGreaterThan(0)
      expect(Object.isFrozen(active)).toBe(true)
      expect(service.inspect().references).toBe(1)
      lease.release()
      expect(await service.retire(registration, wait)).toEqual({ retired: true })
      expect(service.diagnostics()).toEqual(active)
      expect(await service.close(wait)).toEqual({ retired: true })
      expect(service.diagnostics()).toEqual(active)
      rejectDelivery(new Error('diagnostic sink failure'))
      await expect.poll(() => service.diagnostics().pending).toBe(0)
      expect(service.diagnostics()).toEqual({ failed: 1, pending: 0, dropped: active.dropped })
    } finally {
      rejectDelivery(new Error('diagnostic sink cleanup'))
      handle.abort()
      second.abort()
      lease.release()
      await service.close({ ...wait, force: true })
      await host.close()
    }
  })

  it('retirement after an earlier idle interval still waits for the current lease', async () => {
    const service = createModelTransportService({ policy: networkPolicy })
    let disposed = 0
    const registration = register(service, definition(), () => {
      disposed++
    })
    acquire(service).release()
    const later = acquire(service)
    try {
      expect(await service.retire(registration, wait)).toMatchObject({
        remaining_active: true,
        references: 1,
      })
      expect(disposed).toBe(0)
      expect(service.acquire(later.binding, definition().modelId)).toEqual({
        rejected: 'unavailable',
      })
      later.release()
      later.release()
      expect(await service.retire(registration, wait)).toEqual({ retired: true })
      expect(disposed).toBe(1)
    } finally {
      later.release()
      await service.close({ ...wait, force: true })
    }
  })

  it('release does not free callback work and forced cancellation does not acknowledge its completion', async () => {
    const service = createModelTransportService({ policy: networkPolicy })
    const registration = register(service)
    const lease = acquire(service)
    let finishCallback = () => {}
    lease.track(
      new Promise<void>(resolve => {
        finishCallback = resolve
      }),
    )
    lease.release()
    const result = await service.retire(registration, { ...wait, force: true })
    expect(lease.signal.aborted).toBe(true)
    expect(result).toEqual({ remaining_active: true, references: 1, executions: 1 })
    expect(service.inspect().registrations).toBe(1)
    finishCallback()
    expect(await service.retire(registration, wait)).toEqual({ retired: true })
    await service.close(wait)
  })

  it('registering a new definition never substitutes it for the old precise binding', async () => {
    const service = createModelTransportService({ policy: networkPolicy })
    const old = register(service)
    const oldLease = acquire(service)
    const newer = { ...definition(), revision: '2' }
    register(service, newer)
    const requested = input()
    const newInput = {
      ...requested,
      snapshot: {
        ...requested.snapshot,
        adaptation: {
          ...requested.snapshot.adaptation,
          definition: { modelId: newer.modelId, revision: '2' },
        },
      },
    }
    const newLease = acquire(service, newInput)
    try {
      expect(oldLease.binding.definition.revision).toBe('fixture-1')
      expect(newLease.binding.definition.revision).toBe('2')
      expect(oldLease.transport.plan(newInput)).toEqual({
        rejected: 'invalidInput',
        reason: 'malformed',
      })
      const retiring = service.retire(old, wait)
      expect(service.acquire(requested.snapshot.adaptation, requested.routeName)).toEqual({
        rejected: 'unavailable',
      })
      expect('planned' in oldLease.transport.plan(requested)).toBe(true)
      oldLease.release()
      expect(await retiring).toEqual({ retired: true })
      expect('planned' in newLease.transport.plan(newInput)).toBe(true)
      expect(await service.retire(old, wait)).toEqual({ retired: true })
      expect(service.inspect().registrations).toBe(1)
    } finally {
      oldLease.release()
      newLease.release()
      await service.close(wait)
    }
  })

  it('rejects conflicts and preserves declaration content after its owner retires', async () => {
    const service = createModelTransportService({ policy: networkPolicy })
    const owner = {},
      cleanup = () => {}
    const meter = syntheticInputMeter(definition(), 'openai')
    const original = service.registerAdaptation(definition(), meter, owner, cleanup)
    if ('rejected' in original) throw new Error('valid registration rejected')
    expect(service.registerAdaptation(definition(), meter, owner, cleanup)).toEqual(original)
    expect(service.registerAdaptation(definition(), meter, {}, cleanup)).toEqual({
      rejected: 'invalidInput',
    })
    expect(
      service.registerAdaptation(
        { ...definition(), capabilities: { ...definition().capabilities, maxInputTokens: 1 } },
        meter,
        owner,
        cleanup,
      ),
    ).toEqual({ rejected: 'invalidInput' })
    expect(await service.retire(original.registered, wait)).toEqual({ retired: true })
    expect(
      service.registerAdaptation(
        { ...definition(), capabilities: { ...definition().capabilities, maxInputTokens: 1 } },
        meter,
        {},
        cleanup,
      ),
    ).toEqual({ rejected: 'invalidInput' })
    const replacement = register(service)
    expect(await service.retire(original.registered, wait)).toEqual({ retired: true })
    expect(service.inspect().registrations).toBe(1)
    expect(await service.retire(replacement, wait)).toEqual({ retired: true })
    await service.close(wait)
  })

  it('captures independent configuration values with the same revision spelling', async () => {
    const service = createModelTransportService({ policy: networkPolicy })
    register(service, definition(true))
    const first = input(true),
      second = input(true)
    const altered = {
      ...second,
      snapshot: {
        ...second.snapshot,
        adaptation: {
          ...second.snapshot.adaptation,
          configuration: {
            revision: 'c1',
            values: {
              cache: { mode: 'explicit', ttl: '5m', breakpoints: ['system'] },
            },
          },
        },
      },
    }
    const a = acquire(service, first),
      b = acquire(service, altered)
    try {
      expect('planned' in a.transport.plan(first)).toBe(true)
      expect('planned' in b.transport.plan(altered)).toBe(true)
      expect(a.transport.plan(altered)).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
      expect(b.transport.plan(first)).toEqual({ rejected: 'invalidInput', reason: 'malformed' })
      expect(Object.isFrozen(a.binding.configuration.values)).toBe(true)
    } finally {
      a.release()
      b.release()
      await service.close(wait)
    }
  })

  it('retains visible ownership when contribution cleanup fails', async () => {
    const service = createModelTransportService({ policy: networkPolicy })
    const registration = register(service, definition(), () => {
      throw new Error('controlled cleanup failure')
    })
    expect(await service.retire(registration, wait)).toEqual({ cleanup_failed: true })
    expect(service.inspect()).toMatchObject({ registrations: 1, retiring: 1, cleanupFailures: 1 })
    expect(await service.close(wait)).toEqual({ cleanup_failed: true })
    // No connection was opened; failure does not falsely resolve the service's closed promise.
  })

  it('forced retirement stops a real public invocation and retains its callback until completion', async () => {
    const host = await fixture(cert.tls, res => {
      res.writeHead(200)
      res.write(content('started'))
    })
    const service = createModelTransportService(host.options)
    let cleaned = 0
    const registration = register(service, definition(), () => {
      cleaned++
    })
    const lease = acquire(service)
    let callbackDone = () => {}
    lease.track(
      new Promise<void>(resolve => {
        callbackDone = resolve
      }),
    )
    const handle = invokeModel({
      ...input(),
      transport: lease.transport,
      credential: 'test-secret',
      signal: new AbortController().signal,
      policy: policy(),
    })
    const outcome = lease.track(handle.outcome)
    try {
      await expect.poll(() => handle.snapshot().firstContentAt).toBeDefined()
      lease.release()
      expect(await service.retire(registration, { ...wait, force: true })).toMatchObject({
        remaining_active: true,
      })
      expect(invocation(await outcome).outcome).toBe('interrupted')
      await expect.poll(host.closedSockets).toBe(1)
      expect(cleaned).toBe(0)
      callbackDone()
      expect(await service.retire(registration, wait)).toEqual({ retired: true })
      expect(cleaned).toBe(1)
      expect(host.requests).toHaveLength(1)
    } finally {
      callbackDone()
      handle.abort()
      await outcome
      lease.release()
      await service.close({ ...wait, force: true })
      await host.close()
    }
  })

  it('unknown revisions, missing TTL and mismatched route names issue zero HTTP', async () => {
    const host = await fixture(cert.tls, res => res.end(content('unexpected') + finish()))
    const service = createModelTransportService(host.options)
    register(service, definition(true))
    const requested = input(true),
      binding = requested.snapshot.adaptation
    expect(
      service.acquire(
        { ...binding, definition: { ...binding.definition, revision: 'missing' } },
        requested.routeName,
      ),
    ).toEqual({ rejected: 'unavailable' })
    expect(
      service.acquire(
        { ...binding, configuration: { revision: 'c2', values: { cache: { mode: 'explicit' } } } },
        requested.routeName,
      ),
    ).toEqual({ rejected: 'invalidInput' })
    expect(service.acquire(binding, 'different/model')).toEqual({ rejected: 'invalidInput' })
    expect(host.requests).toHaveLength(0)
    await service.close(wait)
    await host.close()
  })
})
