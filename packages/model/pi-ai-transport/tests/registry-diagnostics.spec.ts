import { imagePreparation } from './image-transport-support.ts'
import { Context } from '@deepseek-ai/cordis'
import {
  createDiagnosticCollector,
  type DiagnosticCollectorConfig,
  type DiagnosticEvent,
  type DiagnosticJournalStore,
  type DiagnosticRecord,
} from '@omne-harness-lite/model-request-runtime'
import {
  createModelTransportService,
  type ModelDefinition,
  type ModelTransportService,
  type RetirementPolicy,
} from '@omne-harness-lite/pi-ai-transport'
import {
  createModelPlugin,
  MODEL_TRANSPORT_SERVICE,
  piAiTransportPlugin,
} from '@omne-harness-lite/pi-ai-transport/plugin'
import { describe, expect, it } from 'vitest'
import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { input, networkPolicy } from './support.ts'

const definition: ModelDefinition = (() => {
  const found = testDefinitions[0]
  if (!found) throw new Error('missing controlled definition')
  return found
})()

function policy(force = false): RetirementPolicy {
  return {
    force,
    waitMilliseconds: 15,
    schedule(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds)
      return () => clearTimeout(timer)
    },
  }
}

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function register(
  service: ModelTransportService,
  value: ModelDefinition = definition,
  owner: object = {},
  cleanup: () => void | Promise<void> = () => {},
) {
  const result = service.registerAdaptation(
    value,
    syntheticInputMeter(value, 'openai'),
    owner,
    cleanup,
  )
  if ('rejected' in result) throw new Error('controlled contribution rejected')
  return result.registered
}

function collectorFixture(collectorId: string) {
  const records: DiagnosticRecord[] = []
  const store: DiagnosticJournalStore = {
    async append(record) {
      records.push(record)
      return 'written'
    },
    async flush() {},
    async query() {
      return { rejected: 'unavailable' }
    },
    async exportPage() {
      return { rejected: 'unavailable' }
    },
    async close() {
      return { complete: true, coverage: 'complete' }
    },
    health() {
      return {
        pendingQueries: 0,
        pendingQueryIo: 0,
        openQueryHandles: 0,
        pendingQueryCloses: 0,
        timedOutQueries: 0,
        queryCloseFailures: 0,
        expired: 0,
        expiredBytes: 0,
        evicted: 0,
        evictedBytes: 0,
        retainedBytes: 0,
        retainedRecords: 0,
        retainedSegments: 0,
        coverage: 'complete',
      }
    },
  }
  const config: DiagnosticCollectorConfig = {
    collectorId,
    scope: { kind: 'local' },
    maxRecordBytes: 4096,
    maxFieldBytes: 512,
    queueMaxRecords: 64,
    queueMaxBytes: 65536,
    segmentMaxBytes: 65536,
    retainedMaxBytes: 131072,
    retainedMaxSegments: 3,
    retentionMs: 60000,
    queryMaxRecords: 8,
    queryMaxBytes: 8192,
    queryScanMaxBytes: 8192,
    queryConcurrency: 1,
    queryMaxDurationMs: 500,
    exportMaxRecords: 8,
    exportMaxBytes: 8192,
    closeWaitMs: 500,
    stderrMaxReports: 1,
    monotonicClock: () => 1,
    wallClock: () => new Date('2026-09-29T00:00:00Z'),
    schedule(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds)
      return { cancel: () => clearTimeout(timer) }
    },
    store,
  }
  return { collector: createDiagnosticCollector(config), records }
}

describe('actual registry engineering diagnostics', () => {
  it('reports only real publication, acquisition and final retirement, preserving exact owned revisions', async () => {
    const events: DiagnosticEvent[] = []
    const service = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        record(event) {
          events.push(event)
          return { recorded: { collectorId: 'local', sequence: String(events.length) } }
        },
      },
    })
    const owner = {}
    const cleanup = () => {}
    const meter = syntheticInputMeter(definition, 'openai')
    const registration = register(service, definition, owner, cleanup)
    expect(service.registerAdaptation(definition, meter, owner, cleanup)).toEqual({
      registered: registration,
    })
    expect(
      events.filter(
        event => event.facts.kind === 'registration' && event.facts.phase === 'published',
      ),
    ).toHaveLength(1)
    expect(service.registerAdaptation(definition, meter, {}, cleanup)).toEqual({
      rejected: 'invalidInput',
    })
    const requested = input()
    const acquired = service.acquire(requested.snapshot.adaptation, requested.routeName)
    if ('rejected' in acquired) throw new Error('controlled acquire rejected')
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'registration',
        outcome: 'accepted',
        binding: expect.objectContaining({
          implementationRevision: definition.implementation.revision,
          definitionRevision: definition.revision,
          configurationRevision: requested.snapshot.adaptation.configuration.revision,
        }),
        facts: expect.objectContaining({ phase: 'admitted', references: 1, executions: 0 }),
      }),
    )
    const retiring = service.retire(registration, policy())
    expect(service.acquire(requested.snapshot.adaptation, requested.routeName)).toEqual({
      rejected: 'unavailable',
    })
    expect(await retiring).toMatchObject({ remaining_active: true, references: 1 })
    expect(events.some(event => event.stage === 'retirement' && event.outcome === 'stopped')).toBe(
      false,
    )
    acquired.lease.release()
    expect(await service.retire(registration, policy())).toEqual({ retired: true })
    expect(
      events.filter(event => event.stage === 'retirement' && event.outcome === 'stopped'),
    ).toHaveLength(1)
    expect(await service.close(policy())).toEqual({ retired: true })
    expect(events.some(event => JSON.stringify(event).includes('configuration.values'))).toBe(false)
  })

  it('keeps forced cancellation, remaining active, late stop and cleanup failure separate', async () => {
    const events: DiagnosticEvent[] = []
    const service = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        record(event) {
          events.push(event)
          return { recorded: { collectorId: 'local', sequence: String(events.length) } }
        },
      },
    })
    const work = deferred()
    const registration = register(service)
    const request = input()
    const acquired = service.acquire(request.snapshot.adaptation, request.routeName)
    if ('rejected' in acquired) throw new Error('controlled acquire rejected')
    acquired.lease.track(work.promise)
    acquired.lease.release()
    expect(await service.retire(registration, policy(true))).toEqual({
      remaining_active: true,
      references: 1,
      executions: 1,
    })
    expect(acquired.lease.signal.aborted).toBe(true)
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'retirement',
        outcome: 'cancel_requested',
        facts: expect.objectContaining({ cancellation: 'requested' }),
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'retirement',
        outcome: 'waiting',
        facts: expect.objectContaining({
          cancellation: 'remaining_active',
          references: 1,
          executions: 1,
        }),
      }),
    )
    expect(events.some(event => event.stage === 'retirement' && event.outcome === 'stopped')).toBe(
      false,
    )
    work.resolve()
    expect(await service.retire(registration, policy())).toEqual({ retired: true })
    expect(events.some(event => event.stage === 'retirement' && event.outcome === 'stopped')).toBe(
      true,
    )
    await service.close(policy())

    const failed = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        record(event) {
          events.push(event)
          return { recorded: { collectorId: 'local', sequence: String(events.length) } }
        },
      },
    })
    const broken = register(failed, definition, {}, () => {
      throw new Error('private cleanup secret')
    })
    expect(await failed.retire(broken, policy())).toEqual({ cleanup_failed: true })
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'retirement',
        outcome: 'failed',
        facts: expect.objectContaining({ cancellation: 'cleanup_failed' }),
      }),
    )
    expect(JSON.stringify(events)).not.toContain('private cleanup secret')
  })

  it('reports the actual timeout result counts even when a reference drains before the caller resumes', async () => {
    const events: DiagnosticEvent[] = []
    const service = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        record(event) {
          events.push(event)
          return { recorded: { collectorId: 'local', sequence: String(events.length) } }
        },
      },
    })
    const registration = register(service)
    const requested = input()
    const acquired = service.acquire(requested.snapshot.adaptation, requested.routeName)
    if ('rejected' in acquired) throw new Error('controlled acquire rejected')
    const timeout: RetirementPolicy = {
      force: false,
      waitMilliseconds: 1,
      schedule(_milliseconds, callback) {
        callback()
        return () => {}
      },
    }
    const result = service.retire(registration, timeout)
    acquired.lease.release()
    expect(await result).toEqual({ remaining_active: true, references: 1, executions: 0 })
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'retirement',
        outcome: 'waiting',
        facts: expect.objectContaining({ references: 1, executions: 0 }),
      }),
    )
    expect(await service.retire(registration, policy())).toEqual({ retired: true })
    await service.close(policy())
  })

  it('is accepted by the real local collector and distinguishes service generations', async () => {
    const first = collectorFixture('registry-generation-a')
    const second = collectorFixture('registry-generation-b')
    const one = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: first.collector.emitter({ kind: 'local' }, { executionId: 'service-a' }),
    })
    const two = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: second.collector.emitter(
        { kind: 'local' },
        { executionId: 'service-b' },
      ),
    })
    const a = register(one)
    const b = register(two)
    expect(await one.retire(a, policy())).toEqual({ retired: true })
    expect(await two.retire(b, policy())).toEqual({ retired: true })
    await one.close(policy())
    await two.close(policy())
    expect(await first.collector.close()).toMatchObject({ complete: true })
    expect(await second.collector.close()).toMatchObject({ complete: true })
    expect(first.records.length).toBeGreaterThan(0)
    expect(second.records.length).toBeGreaterThan(0)
    expect(
      first.records.every(
        record =>
          record.collectorId === 'registry-generation-a' &&
          record.association?.executionId === 'service-a',
      ),
    ).toBe(true)
    expect(
      second.records.every(
        record =>
          record.collectorId === 'registry-generation-b' &&
          record.association?.executionId === 'service-b',
      ),
    ).toBe(true)
    expect(first.collector.health().invalidRecords).toBe(0)
    expect(second.collector.health().invalidRecords).toBe(0)
    expect(one.inspect()).toMatchObject({
      registryDiagnosticFailures: 0,
      registryDiagnosticDropped: 0,
    })
    expect(two.inspect()).toMatchObject({
      registryDiagnosticFailures: 0,
      registryDiagnosticDropped: 0,
    })
  })

  it('keeps absent, throwing, rejected and malformed borrowed record results separate from network health', async () => {
    const absent = createModelTransportService({ imagePreparation, policy: networkPolicy })
    const noDiagnostic = register(absent)
    expect(await absent.retire(noDiagnostic, policy())).toEqual({ retired: true })
    expect(await absent.close(policy())).toEqual({ retired: true })
    expect(absent.inspect()).toMatchObject({
      registryDiagnosticFailures: 0,
      registryDiagnosticDropped: 0,
    })

    const throws = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        record() {
          throw new Error('private thrown secret')
        },
      },
    })
    const thrown = register(throws)
    expect(await throws.retire(thrown, policy())).toEqual({ retired: true })
    expect(await throws.close(policy())).toEqual({ retired: true })
    expect(throws.inspect().registryDiagnosticFailures).toBeGreaterThan(1)
    expect(throws.inspect().registryDiagnosticDropped).toBe(0)
    expect(throws.diagnostics()).toEqual({ failed: 0, pending: 0, dropped: 0 })

    const dropped = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: { record: () => ({ dropped: 'queue_full' }) },
    })
    const declined = register(dropped)
    expect(await dropped.retire(declined, policy())).toEqual({ retired: true })
    expect(await dropped.close(policy())).toEqual({ retired: true })
    expect(dropped.inspect().registryDiagnosticDropped).toBeGreaterThan(0)
    expect(dropped.inspect().registryDiagnosticFailures).toBe(0)
    expect(dropped.diagnostics()).toEqual({ failed: 0, pending: 0, dropped: 0 })

    const malformed = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        // @ts-expect-error exercise a runtime callback violating its declared result
        record: () => ({ dropped: 'private unsupported result' }),
      },
    })
    const invalid = register(malformed)
    expect(await malformed.retire(invalid, policy())).toEqual({ retired: true })
    expect(await malformed.close(policy())).toEqual({ retired: true })
    expect(malformed.inspect().registryDiagnosticFailures).toBeGreaterThan(0)
    expect(malformed.inspect().registryDiagnosticDropped).toBe(0)
  })

  it('stops a thenable-violating emitter after one call without awaiting its rejection or holding a lease', async () => {
    let calls = 0
    const service = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        // @ts-expect-error exercise a runtime callback returning a Promise from a synchronous port
        record() {
          calls++
          return Promise.reject(new Error('private rejected secret'))
        },
      },
    })
    const registration = register(service)
    const requested = input()
    const acquired = service.acquire(requested.snapshot.adaptation, requested.routeName)
    if ('rejected' in acquired) throw new Error('controlled acquire rejected')
    acquired.lease.release()
    expect(await service.retire(registration, policy())).toEqual({ retired: true })
    expect(await service.close(policy())).toEqual({ retired: true })
    expect(calls).toBe(1)
    expect(service.inspect()).toMatchObject({
      registryDiagnosticFailures: 1,
      registryDiagnosticDropped: 0,
      references: 0,
      executions: 0,
    })
  })

  it('does not retain a lease or start repeated reactions for a permanently pending diagnostic Promise', async () => {
    const never = new Promise<void>(() => {})
    let calls = 0
    const service = createModelTransportService({
      imagePreparation,
      policy: networkPolicy,
      registryDiagnostics: {
        // @ts-expect-error deliberately return a never-settling Promise from a sync port
        record() {
          calls++
          return never
        },
      },
    })
    const registration = register(service)
    const requested = input()
    const acquired = service.acquire(requested.snapshot.adaptation, requested.routeName)
    if ('rejected' in acquired) throw new Error('controlled acquire rejected')
    acquired.lease.release()
    expect(await service.retire(registration, policy())).toEqual({ retired: true })
    expect(await service.close(policy())).toEqual({ retired: true })
    expect(calls).toBe(1)
    expect(service.inspect()).toMatchObject({ registryDiagnosticFailures: 1, references: 0 })
  })

  it('observes actual Cordis contribution replacement without retiring the new revision', async () => {
    const fixture = collectorFixture('cordis-registry')
    const ctx = new Context()
    const next = { ...definition, revision: `${definition.revision}-next` }
    try {
      await ctx.plugin(piAiTransportPlugin, {
        imagePreparation,
        policy: networkPolicy,
        retirement: policy(),
        registryDiagnostics: fixture.collector.emitter(
          { kind: 'local' },
          { executionId: 'cordis-service' },
        ),
      })
      const old = ctx.plugin(
        createModelPlugin(definition, syntheticInputMeter(definition, 'openai'), policy()),
        {},
      )
      await old
      const newer = ctx.plugin(
        createModelPlugin(next, syntheticInputMeter(next, 'openai'), policy()),
        {},
      )
      await newer
      const service: unknown = ctx.get(MODEL_TRANSPORT_SERVICE)
      if (
        !service ||
        typeof service !== 'object' ||
        !('inspect' in service) ||
        typeof service.inspect !== 'function'
      )
        throw new Error('service missing')
      expect(service.inspect()).toMatchObject({ registrations: 2 })
      await old.dispose()
      expect(service.inspect()).toMatchObject({ registrations: 1 })
    } finally {
      await ctx.fiber.dispose()
      await fixture.collector.close()
    }
    const published = fixture.records.filter(
      record =>
        record.stage === 'registration' &&
        record.facts.kind === 'registration' &&
        record.facts.phase === 'published',
    )
    const stopped = fixture.records.filter(
      record => record.stage === 'retirement' && record.outcome === 'stopped' && record.binding,
    )
    expect(published.map(record => record.binding?.definitionRevision)).toEqual([
      definition.revision,
      next.revision,
    ])
    expect(stopped.map(record => record.binding?.definitionRevision)).toContain(definition.revision)
  })
})
