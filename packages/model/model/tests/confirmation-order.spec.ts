import { afterEach, expect, it, vi } from 'vitest'
import { encodeModelInvocationRef } from '@omne-harness/model-contract'
import {
  createModelCommandsCore,
  createModelInitialExecution,
  createModelInitialRun,
  createModelObservationStorage,
  modelCommands,
  type ModelCommandStorage,
  type ModelInitialHostChannel,
} from '../src/commands/index.ts'
import * as observationModule from '../src/stream-source.ts'
import * as initialModule from '../src/commands/initial.ts'
import { MemoryState } from '../src/testing/state.ts'
import { fixture, instance, unbox } from './memory-fixture.ts'

afterEach(() => vi.restoreAllMocks())

it('initial confirmation and a throwing diagnostic cannot replace the committed outcome', async () => {
  const f = fixture()
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords: 1, maxBindings: 1, maxCallsPerBinding: 1 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const original = new Error('private detail must not escape')
  const port = initialModule.initialRunPort
  vi.spyOn(initialModule, 'initialRunPort').mockImplementation(target => {
    const originalPort = port(target)
    return target !== run
      ? originalPort
      : {
          ...originalPort,
          finishConfirmation: () => {
            throw original
          },
        }
  })
  const diagnostics: unknown[] = []
  const memory = new MemoryState(f.options)
  const bridge = createModelObservationStorage({
    storage: memory,
    authority: f.options.authority,
    initialRun: run,
    report: event => {
      diagnostics.push(event)
      throw original
    },
  })
  const core = createModelCommandsCore({ ...f.options, initialRun: run }, bridge.storage)
  const initial = createModelInitialExecution({ core, run })
  const channel = unbox(initial.openHost({ instance: instance() }))
  expect(await modelCommands(core).admit(f.admit)).toHaveProperty('ok')
  expect(diagnostics).toEqual([{ kind: 'initial-confirmation-failed' }])
  expect(await channel.prepare(f.admit)).toMatchObject({
    failure: { diagnostic: 'confirmation-unavailable' },
  })
})

it('a storage throw after synchronous work clears confirmation and rethrows the same object', async () => {
  const f = fixture()
  const memory = new MemoryState(f.options)
  const original = new Error('original storage exception')
  let throwNext = true
  const storage: ModelCommandStorage = {
    run: async (work, scope) => {
      if (!throwNext) return memory.run(work, scope)
      throwNext = false
      work()
      throw original
    },
    documents: tenant => memory.documents(tenant),
    reserved: field => memory.reserved(field),
    commit: (tenant, write) => memory.commit(tenant, write),
    publish: (tenant, call) => memory.publish(tenant, call),
  }
  const run = createModelInitialRun<typeof f.principal>({
    limits: { maxRecords: 1, maxBindings: 1, maxCallsPerBinding: 1 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const bridge = createModelObservationStorage({
    storage,
    authority: f.options.authority,
    initialRun: run,
    report: () => {},
  })
  const core = createModelCommandsCore({ ...f.options, initialRun: run }, bridge.storage)
  await expect(modelCommands(core).admit(f.admit)).rejects.toBe(original)
  const initial = createModelInitialExecution({ core, run })
  const channel = unbox(initial.openHost({ instance: instance() }))
  expect(await channel.prepare(f.admit)).toMatchObject({
    failure: { diagnostic: 'confirmation-unavailable' },
  })
})

it.each([false, true])(
  'confirms initial admission before real observation, including callback throw=%s',
  async throwObservation => {
    const f = fixture()
    const original = observationModule.createModelObservationSource
    let channel: ModelInitialHostChannel<typeof f.principal>
    let prepared: ReturnType<typeof channel.prepare> | undefined
    let captured = false
    vi.spyOn(observationModule, 'createModelObservationSource').mockImplementation(input => {
      const source = original(input)
      return {
        ...source,
        confirm: facts => {
          if (facts.state.phase === 'accepted' && !captured) {
            captured = true
            prepared = channel.prepare(f.admit)
          }
          source.confirm(facts)
          if (throwObservation) throw new Error('private observation detail')
        },
      }
    })
    const run = createModelInitialRun<typeof f.principal>({
      limits: { maxRecords: 1, maxBindings: 1, maxCallsPerBinding: 1 },
      checkOriginRead: () => ({ ok: undefined }),
    })
    const memory = new MemoryState(f.options)
    const diagnostics: unknown[] = []
    const bridge = createModelObservationStorage({
      storage: memory,
      authority: f.options.authority,
      initialRun: run,
      report: event => {
        diagnostics.push(event)
        throw new Error('private report detail')
      },
      observation: {
        limits: {
          maxSnapshotBytes: 100000,
          maxDeltaBytes: 100000,
          maxQueuedFrames: 16,
          maxQueuedBytes: 500000,
          maxObserversPerTenant: 4,
          maxObservers: 4,
          maxPendingSourceOperations: 4,
          maxRetainedCalls: 8,
          maxRetainedBytes: 1000000,
          maxTotalBytes: 5000000,
          maxQueueResidenceMs: 10000,
          checkIntervalMs: 1000,
        },
        timing: { nowMs: () => 0, waitUntil: () => Promise.resolve('elapsed') },
      },
    })
    const core = createModelCommandsCore({ ...f.options, initialRun: run }, bridge.storage)
    const initial = createModelInitialExecution({ core, run })
    channel = unbox(initial.openHost({ instance: instance() }))
    try {
      expect(await modelCommands(core).admit(f.admit)).toHaveProperty('ok')
      expect(prepared).toBeDefined()
      expect(await prepared).toHaveProperty('ok')
      expect(diagnostics).toEqual(
        throwObservation
          ? [
              { kind: 'observation-confirmation-failed' },
              { kind: 'observation-confirmation-failed' },
            ]
          : [],
      )
      if (throwObservation) {
        const host = bridge.observations && unbox(bridge.observations.openHost())
        const reference = unbox(
          encodeModelInvocationRef({
            tenant: f.tenant,
            call: f.admit.call,
            admission: f.admit.operation,
          }),
        )
        expect(await host?.references.current({ access: f.admit, reference })).toMatchObject({
          failure: { kind: 'unavailable' },
        })
      }
    } finally {
      channel.close()
      bridge.observations?.close()
    }
  },
)
