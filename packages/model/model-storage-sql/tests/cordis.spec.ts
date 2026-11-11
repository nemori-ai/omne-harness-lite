// Real Cordis and the node:sqlite provider from fixture.ts. TestSendStage is a named
// model-host-local send-stage substitute: it proves dependency/lifetime wiring, not transport.
import { Context, symbols, type Fiber } from '@deepseek-ai/cordis'
import type { SendCoordinator } from '@omne-harness/model'
import { createModelInitialRun, type ModelObservationLimits } from '@omne-harness/model/commands'
import { createMemoryModelCommands } from '@omne-harness/model/testing'
import { decodeDispatchId } from '@omne-harness/model-contract'
import {
  ModelCredentialService,
  ModelSendBoundaryService,
  modelCommandsKey,
  modelCredentialKey,
} from '@omne-harness/model-cordis-contract/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createSqlModelRecordsPlugin,
  type ModelRecordsActivation,
} from '@omne-harness/model-storage-sql/cordis'
import { COMMAND_RESERVE_BYTES } from '../src/index.ts'
import {
  callId,
  coreOptions,
  DIGEST,
  instanceId,
  lookup,
  MAX_CALL_BYTES,
  opId,
  proof,
  sqliteStorage,
  tenantOf,
  textOf,
  unbox,
  type Principal,
} from './fixture.ts'

const contexts: Context[] = []
const STATES = { PENDING: 0, ACTIVE: 2, FAILED: 3, DISPOSED: 4 } as const
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

function scene() {
  const ctx = new Context()
  contexts.push(ctx)
  const tenant = tenantOf('a')
  const core = coreOptions([tenant])
  const sqlite = sqliteStorage()
  const observed: { coordinator?: SendCoordinator<Principal>; child?: Fiber; closed: number } = {
    closed: 0,
  }
  ctx.on('internal/plugin', fiber => {
    if (fiber.runtime?.name === 'TestSendStage') observed.child = fiber
  })
  const config = {
    owners: core.options.owners,
    limits: core.options.limits,
    maxCallBytes: MAX_CALL_BYTES,
    maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
    combinationVersion: 'v1',
    send: { mirrorBytes: 2 ** 22, maxClaims: 8 },
  }
  const dependencies = {
    storage: sqlite.storage,
    domains: lookup([textOf(tenant)], 'records'),
    authority: core.options.authority,
    evidence: core.options.evidence,
    clock: core.options.clock,
    manifestDigest: DIGEST,
    sources: [],
  }
  const Plugin = createSqlModelRecordsPlugin({
    inject: [],
    resolve: () => dependencies,
    sendStage(coordinator) {
      observed.coordinator = coordinator
      class TestSendStage extends ModelSendBoundaryService<unknown> {
        static readonly inject = [modelCredentialKey, modelCommandsKey]
        readonly send = async () => ({
          kind: 'not-started' as const,
          failure: {
            kind: 'unavailable' as const,
            dependency: 'test-send-stage',
            diagnostic: 'substitute',
          },
        })
        constructor(child: Context, settings: { fail: boolean }) {
          super(child)
          if (settings.fail) throw new Error('test-send-start-failed')
          child.fiber.effect(() => () => {
            observed.closed += 1
          })
        }
      }
      return { plugin: TestSendStage, config: { fail: false } }
    },
  })
  class TestCredential extends ModelCredentialService {
    readonly layerOf = () => ({ failure: { kind: 'unavailable' } }) as const
    readonly resolve = () => ({ failure: { kind: 'unavailable' } }) as const
  }
  return { ctx, tenant, core, sqlite, observed, config, dependencies, Plugin, TestCredential }
}

it('keeps SQL commands ACTIVE with a PENDING send child, resumes credentials and unloads both', async () => {
  const f = scene()
  const parent = await f.ctx.plugin(f.Plugin, f.config)
  expect(parent.state).toBe(STATES.ACTIVE)
  expect(f.observed.child?.state).toBe(STATES.PENDING)
  const admit = f.core.admitOf(f.tenant, callId('pending'), opId('admit-pending'))
  expect(await f.ctx.modelCommands.admit(admit)).toHaveProperty('ok')
  expect(await f.ctx.modelCommands.recall({ ...admit, admission: admit.operation })).toHaveProperty(
    'ok',
  )
  expect(await f.ctx.modelCommands.query(admit)).toHaveProperty('ok')
  expect(f.sqlite.rows('records', 'SELECT call FROM md_call')).toEqual([['mcall_pending']])
  expect(f.observed.coordinator).toBeDefined()
  const coordinator = f.observed.coordinator
  const execution = unbox(
    await f.ctx.modelCommands.claim({
      ...admit,
      instance: instanceId(),
      operation: opId('claim-pending'),
      continuity: proof(admit.call),
    }),
  )
  const recovery = unbox(await f.ctx.modelCommands.loadRecovery(admit))
  const dispatch = unbox(decodeDispatchId('mdisp_pending'))
  unbox(
    await f.ctx.modelCommands.prepareDispatch({
      ...execution,
      operation: opId('prepare-pending'),
      expected: recovery.state.revision,
      dispatch,
      supplier: admit.request.suppliers[0],
      policyDecision: null,
    }),
  )
  expect(
    coordinator?.check(
      {
        ...admit,
        execution,
        dispatch,
        supplier: admit.request.suppliers[0],
        initiator: recovery.initiator,
      },
      'prepare',
    ),
  ).toEqual({ ok: undefined })
  const credential = await f.ctx.plugin(f.TestCredential)
  await f.observed.child?.await()
  expect(f.observed.child?.state).toBe(STATES.ACTIVE)
  expect(f.ctx.modelSendBoundary).toBeDefined()
  await credential.dispose()
  await f.observed.child?.await()
  expect(f.observed.child?.state).toBe(STATES.PENDING)
  expect(await f.ctx.modelCommands.recall({ ...admit, admission: admit.operation })).toHaveProperty(
    'ok',
  )
  await f.ctx.plugin(f.TestCredential)
  await f.observed.child?.await()
  expect(f.observed.coordinator).toBe(coordinator)
  await parent.dispose()
  expect(f.observed.child?.state).toBe(STATES.DISPOSED)
  expect(f.ctx.get(modelCommandsKey)).toBeUndefined()
  expect(f.ctx.get(ModelSendBoundaryService.provide)).toBeUndefined()
  expect(f.observed.closed).toBe(2)
})

it('rejects every absent configuration group and numeric field without defaults', async () => {
  const f = scene()
  const invalid: unknown[] = [
    undefined,
    {},
    { ...f.config, owners: undefined },
    { ...f.config, limits: undefined },
    { ...f.config, combinationVersion: undefined },
    { ...f.config, send: undefined },
  ]
  for (const value of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    invalid.push({ ...f.config, send: { ...f.config.send, mirrorBytes: value } })
  invalid.push(
    { ...f.config, maxCallBytes: f.config.maxCommandBytes },
    { ...f.config, limits: { ...f.config.limits, scanPageCalls: 1001 } },
    { ...f.config, combinationVersion: '' },
  )
  for (const key of ['maxCallBytes', 'maxCommandBytes'])
    invalid.push({ ...f.config, [key]: undefined })
  for (const key of [
    'scanPageCalls',
    'resultPageParts',
    'resultPageTargetBytes',
    'readIdleMs',
    'capacity',
  ])
    invalid.push({ ...f.config, limits: { ...f.config.limits, [key]: undefined } })
  for (const key of ['mirrorBytes', 'maxClaims'])
    invalid.push({ ...f.config, send: { ...f.config.send, [key]: undefined } })
  for (const value of invalid) {
    const loaded = Reflect.apply(f.ctx.plugin, f.ctx, [f.Plugin, value])
    await expect(loaded).rejects.toThrow()
    expect(f.ctx.get(modelCommandsKey)).toBeUndefined()
    await loaded.dispose()
  }
})

it('rejects modelCommands as its own static dependency', () => {
  expect(() =>
    createSqlModelRecordsPlugin({
      inject: [modelCommandsKey],
      resolve: () => {
        throw new Error('unused')
      },
      sendStage: () => {
        throw new Error('unused')
      },
    }),
  ).toThrow(/modelCommands/)
})

it('waits for declared dependencies and resolves objects again after replacement', async () => {
  const f = scene()
  let activations = 0
  const Plugin = createSqlModelRecordsPlugin({
    inject: [modelCredentialKey],
    resolve(ctx) {
      expect(ctx.modelCredential).toBeInstanceOf(ModelCredentialService)
      activations += 1
      return f.dependencies
    },
    sendStage: () => ({ plugin: function DependencySendStage() {}, config: {} }),
  })
  const parent = await f.ctx.plugin(Plugin, f.config)
  expect(parent.state).toBe(STATES.PENDING)
  expect(activations).toBe(0)
  const credential = await f.ctx.plugin(f.TestCredential)
  await parent.await()
  expect(parent.state).toBe(STATES.ACTIVE)
  expect(activations).toBe(1)
  await credential.dispose()
  await parent.await()
  expect(parent.state).toBe(STATES.PENDING)
  expect(f.ctx.get(modelCommandsKey)).toBeUndefined()
  await f.ctx.plugin(f.TestCredential)
  await parent.await()
  expect(parent.state).toBe(STATES.ACTIVE)
  expect(activations).toBe(2)
})

it('leaves a real child startup failure observable without withdrawing SQL commands', async () => {
  const f = scene()
  const error = vi.spyOn(f.ctx.logger, 'error').mockImplementation(() => undefined)
  const Plugin = createSqlModelRecordsPlugin({
    inject: [],
    resolve: () => ({
      storage: f.sqlite.storage,
      domains: lookup([textOf(f.tenant)], 'failed'),
      authority: f.core.options.authority,
      evidence: f.core.options.evidence,
      clock: f.core.options.clock,
      manifestDigest: DIGEST,
      sources: [],
    }),
    sendStage: () => ({
      plugin: function FailedSendStage() {
        throw new Error('send-child-failed')
      },
      config: {},
    }),
  })
  const parent = await f.ctx.plugin(Plugin, f.config)
  const runtime = [...f.ctx.registry.values()].find(runtime => runtime.name === 'FailedSendStage')
  const failed = runtime && [...runtime.fibers][0]
  expect(failed).toBeDefined()
  await expect(failed?.await()).rejects.toThrow('send-child-failed')
  expect(failed?.state).toBe(STATES.FAILED)
  expect(error).toHaveBeenCalled()
  expect(parent.state).toBe(STATES.ACTIVE)
  expect(
    await f.ctx.modelCommands.admit(f.core.admitOf(f.tenant, callId('failed'), opId('a-failed'))),
  ).toHaveProperty('ok')
})

it('matches memory command results through the published service', async () => {
  const f = scene()
  await f.ctx.plugin(f.Plugin, f.config)
  const { commands: memory } = createMemoryModelCommands(f.core.options)
  const input = f.core.admitOf(f.tenant, callId('parity'), opId('admit-parity'))
  expect(await f.ctx.modelCommands.admit(input)).toEqual(await memory.admit(input))
  const recall = { ...input, admission: input.operation }
  expect(await f.ctx.modelCommands.recall(recall)).toEqual(await memory.recall(recall))
  expect(await f.ctx.modelCommands.dispatches(input)).toEqual(await memory.dispatches(input))
})

const observationLimits: ModelObservationLimits = {
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
}
const observationTiming = {
  nowMs: () => 0,
  waitUntil: (_deadline: number, signal: AbortSignal) =>
    new Promise<'cancelled'>(resolve => {
      if (signal.aborted) resolve('cancelled')
      else signal.addEventListener('abort', () => resolve('cancelled'), { once: true })
    }),
}

it('passes a frozen pair of the actual records service and source anew on each activation', async () => {
  const f = scene()
  const activations: ModelRecordsActivation<Principal>[] = []
  const run = createModelInitialRun<Principal>({
    limits: { maxRecords: 8, maxBindings: 2, maxCallsPerBinding: 4 },
    checkOriginRead: () => ({ ok: undefined }),
  })
  const Plugin = createSqlModelRecordsPlugin({
    inject: [modelCredentialKey],
    resolve: () => ({
      ...f.dependencies,
      initialRun: run,
      observation: { timing: observationTiming },
    }),
    sendStage(_coordinator, activation) {
      if (!activation) throw new Error('missing activation')
      activations.push(activation)
      return { plugin: function PairedSendStage() {}, config: {} }
    },
  })
  const parent = await f.ctx.plugin(Plugin, { ...f.config, observation: observationLimits })
  const credential = await f.ctx.plugin(f.TestCredential)
  await parent.await()
  const first = activations[0]
  if (!first?.observation || !first.initial) throw new Error('missing pair')
  expect(Object.isFrozen(first)).toBe(true)
  expect(Object.isFrozen(first.observation)).toBe(true)
  expect(first.observation.commands).toBe(Reflect.get(f.ctx.modelCommands, symbols.original))
  expect(first.observation.commands).toBeInstanceOf(Plugin)
  for (const property of ['initial', 'observation', 'observations', 'coordinator', 'storage'])
    expect(Object.hasOwn(first.observation.commands, property)).toBe(false)
  const input = f.core.admitOf(f.tenant, callId('paired'), opId('admit-paired'))
  unbox(await f.ctx.modelCommands.admit(input))
  const channel = unbox(first.initial.openHost({ instance: instanceId('pair') }))
  const prepared = unbox(await channel.prepare(input))
  const host = unbox(first.observation.source.openHost())
  await credential.dispose()
  await parent.await()
  expect(first.observation.source.openHost()).toMatchObject({ failure: { kind: 'unavailable' } })
  host.close()
  await f.ctx.plugin(f.TestCredential)
  await parent.await()
  const second = activations[1]
  if (!second?.observation || !second.initial) throw new Error('missing replacement pair')
  expect(second.observation.commands).toBe(Reflect.get(f.ctx.modelCommands, symbols.original))
  expect(second.observation.commands).not.toBe(first.observation.commands)
  expect(second.observation.source).not.toBe(first.observation.source)
  expect(unbox(await channel.prepare(input))).toEqual(prepared)
  channel.close()
})

it('rejects half-enabled observation configuration and requires every explicit observation limit', async () => {
  const f = scene()
  const Plugin = createSqlModelRecordsPlugin({
    inject: [],
    resolve: () => ({ ...f.dependencies, observation: { timing: observationTiming } }),
    sendStage: () => ({ plugin: function UnusedSendStage() {}, config: {} }),
  })
  for (const [plugin, config] of [
    [Plugin, f.config],
    [f.Plugin, { ...f.config, observation: observationLimits }],
  ] as const) {
    const fiber = f.ctx.plugin(plugin, config)
    await expect(fiber).rejects.toThrow('both limits and timing')
    await fiber.dispose()
  }
  for (const key of Object.keys(observationLimits)) {
    const fiber = f.ctx.plugin(Plugin, {
      ...f.config,
      observation: { ...observationLimits, [key]: undefined },
    })
    await expect(fiber).rejects.toThrow()
    await fiber.dispose()
  }
})
