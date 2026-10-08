import { sqlJournalFault } from './sql-fault-fixture.ts'
import { RunnerHostService } from '@omne-harness-lite/loop-extension-runner/cordis'
// @module-tag slow
// 归慢层：整套装配＋真库：用例在 SQLite 文件库上起租户与资产注册的整套装配，并开真实 SQL journal 会话日志。
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import { judgePositionedSubject } from '@omne-harness-lite/loop-extension'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { loadDefaultRetry } from '../../../model/model-request-runtime-local/tests/retry-assembly.ts'
import { createRunnerTaskOwner } from '../src/task-owner.ts'
import { loopExtensionRunnerPlugin } from '../src/cordis.ts'
import {
  type RunnerServiceHost,
  type RunnerImplementations,
  type LoopExtensionRunnerService,
  type RunnerDispatchRequest,
  type RunnerExecutionPorts,
} from '@omne-harness-lite/loop-extension-runner'
import { chainHost, session } from './runner-chain-support.ts'
import { DeniedAccess } from './denied-access.ts'

const positioned = judgePositionedSubject({
  position: 'before_model_call',
  subject: { request: { target: 'example/model', parameters: {}, messages: [], tools: [] } },
})
if ('rejected' in positioned || positioned.ok.position !== 'before_model_call')
  throw new Error('fixture subject invalid')
const initial = positioned.ok
const request: RunnerDispatchRequest = {
  ...initial,
  manifest: session,
  anchor: 'model-call',
  run: 'run',
  attempt: 1,
}
const replay = { ...initial, manifest: session, anchor: 'model-call', run: 'run' }
function latch() {
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}
async function serviceHost() {
  const facts = await chainHost()
  expect(
    await facts.registry.fill(session, facts.evaluation, 'evaluation_one', facts.order),
  ).toHaveProperty('snapshots')
  const dir = await mkdtemp(join(tmpdir(), 'omne-runner-service-'))
  const logOptions = {
    dir,
    processOwnership: {
      current: 'runner-service-test',
      observeExit: async () => 'exited' as const,
    },
  }
  const log = await openSqlLogFixture({ dir: logOptions.dir })
  const operations = {
    append: vi.fn(log.append),
    readByKey: vi.fn(log.readByKey),
    readSince: vi.fn(log.readSince),
  }
  const owner = createRunnerTaskOwner(facts.binding)
  const ctx = new Context()
  const accessProvider = await ctx.plugin({
    name: 'model-only-access',
    apply(inner) {
      new DeniedAccess(inner)
    },
  })
  const provider = await ctx.plugin({
    name: 'actual-log',
    apply(inner) {
      inner.provide('sessionLog', operations)
    },
  })
  let scopes = 0
  const openHandles = vi.fn(async () => ({
    log: unwrap(parseOpaqueIdentifier('test_log', 'LogHandle')),
    environment: unwrap(parseOpaqueIdentifier('test_environment', 'EnvironmentHandle')),
    release() {},
  }))
  const execution: RunnerExecutionPorts = {
    readAskState: vi.fn(async () => ({ kind: 'unavailable' as const })),
    openHandles,
    verifyFailure: vi.fn(async (_subject, _binding, _execution) => ({
      kind: 'unavailable' as const,
    })),
    judgeCapabilities: vi.fn(async (_input, output) =>
      output.kind === 'observed' ? { kind: 'accepted' as const } : { kind: 'unavailable' as const },
    ),
    now: vi.fn(() => '2026-09-29T00:00:00Z'),
    mintReminder: vi.fn(() => 'reminder'),
    fallbackNeedsProjection: vi.fn(async () => false),
    commandPresence: vi.fn(async () => 'unavailable' as const),
    invokeCommand: vi.fn(async () => ({ kind: 'notStartedUnavailable' as const })),
  }
  function scope() {
    scopes++
    return {
      binding: facts.binding,
      sources: facts.sources,
      owner,
      isActive: () => true,
      release() {
        scopes--
      },
    }
  }
  const host: RunnerServiceHost = {
    acquireDispatch: vi.fn<RunnerServiceHost['acquireDispatch']>(async requested =>
      requested.manifest !== session
        ? { failure: 'manifestMissing' }
        : {
            ...scope(),
            ports: execution,
            subjectForCandidate: () => initial,
            readMessagePrefix: async () => [],
          },
    ),
    acquireReplay: vi.fn<RunnerServiceHost['acquireReplay']>(async requested =>
      requested.manifest !== session ? { failure: 'manifestMissing' } : scope(),
    ),
  }
  new TestHost(ctx, host)
  const runnerFiber = await ctx.plugin(loopExtensionRunnerPlugin, {})
  const runner = ctx.get('loopExtensionRunner') as LoopExtensionRunnerService
  const implementations = ctx.get('loopExtensionImplementations') as RunnerImplementations
  return {
    dir,
    logOptions,
    facts,
    operations,
    log,
    owner,
    ctx,
    provider,
    runnerFiber,
    runner,
    implementations,
    host,
    execution,
    scopes: () => scopes,
    async close() {
      await runnerFiber.dispose()
      await provider.dispose()
      await accessProvider.dispose()
      await log.close()
      // Do not mask a failed recovery assertion with an indefinitely pending unknown drain.
      if (!owner.hasUnknown(facts.binding)) await owner.drain()
      await facts.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

test('Cordis service dispatches a real manifest chain into SQL journal; replay reads without invoking, guarding, handles, time or writes', async () => {
  const h = await serviceHost()
  try {
    const invoke = vi.fn(async () => ({ kind: 'output' as const, value: { kind: 'observed' } }))
    h.implementations.registerBuiltin('example:a', invoke)
    h.implementations.registerBuiltin('example:b', invoke)
    const done = await h.runner.dispatch(request, new AbortController().signal)
    expect(done).toMatchObject({
      conclusions: [{ extension: 'example:b' }, { extension: 'example:a' }],
      effect: { kind: 'proceed' },
    })
    const read = await h.log.readSince(unwrap(parseOpaqueIdentifier(session, 'SessionRef')), 0)
    expect(read).toHaveProperty('tail', 2)
    expect(invoke).toHaveBeenCalledTimes(2)
    for (const port of Object.values(h.execution)) vi.mocked(port).mockClear()
    invoke.mockClear()
    h.operations.append.mockClear()
    h.operations.readByKey.mockClear()
    h.operations.readSince.mockClear()
    expect(await h.runner.replay(replay)).toMatchObject([
      { extension: 'example:b' },
      { extension: 'example:a' },
    ])
    expect(invoke).not.toHaveBeenCalled()
    expect(h.operations.append).not.toHaveBeenCalled()
    expect(h.operations.readByKey).toHaveBeenCalledOnce()
    expect(h.operations.readSince).not.toHaveBeenCalled()
    expect(
      await h.log.readSince(unwrap(parseOpaqueIdentifier(session, 'SessionRef')), 0),
    ).toHaveProperty('tail', 2)
    for (const port of Object.values(h.execution)) expect(port).not.toHaveBeenCalled()
    expect(h.scopes()).toBe(0)
    expect(await h.runner.replay({ ...replay, attempt: 0 } as unknown as typeof replay)).toEqual({
      failure: 'invalidInput',
    })
  } finally {
    await h.close()
  }
})

test('real P5 contribution fiber registers with runner; duplicate fails without removing original, unload permits a fresh contribution', async () => {
  const h = await serviceHost()
  const policy = {
    kind: 'linear' as const,
    base: 'PT1S',
    factor: 2,
    max: 'PT10S',
    jitter: 'none' as const,
  }
  try {
    const contribution = await loadDefaultRetry(h.ctx, { policy, sample: () => 0.5 })
    const duplicate = loadDefaultRetry(h.ctx, { policy, sample: () => 0.5 })
    await expect(Promise.resolve(duplicate)).rejects.toThrow()
    expect(() =>
      h.implementations.registerBuiltin('omne-official:default-retry', async () => ({
        kind: 'notStartedUnavailable',
      })),
    ).toThrow()
    await duplicate.dispose()
    await contribution.dispose()
    const next = await loadDefaultRetry(h.ctx, { policy, sample: () => 0.5 })
    await next.dispose()
  } finally {
    await h.close()
  }
})

test('M17-V10 P5 stays unpublished while the runner registry is absent and registers once it appears', async () => {
  const h = await serviceHost()
  const policy = {
    kind: 'linear' as const,
    base: 'PT1S',
    factor: 2,
    max: 'PT10S',
    jitter: 'none' as const,
  }
  let replacement: Awaited<ReturnType<typeof h.ctx.plugin>> | undefined
  let contribution: Awaited<ReturnType<typeof h.ctx.plugin>> | undefined
  try {
    await h.runnerFiber.dispose()
    expect(h.ctx.get('loopExtensionImplementations')).toBeUndefined()
    contribution = loadDefaultRetry(h.ctx, { policy, sample: () => 0.5 })
    await Promise.resolve()
    expect(contribution.state).not.toBe(FIBER_STATE.ACTIVE)
    replacement = await h.ctx.plugin(loopExtensionRunnerPlugin, {})
    await contribution
    const implementations = h.ctx.get('loopExtensionImplementations') as RunnerImplementations
    // The contribution registered with the new registry generation, so a second one is refused.
    expect(() =>
      implementations.registerBuiltin('omne-official:default-retry', async () => ({
        kind: 'notStartedUnavailable',
      })),
    ).toThrow('already registered')
    await contribution.dispose()
    const fresh = implementations.registerBuiltin('omne-official:default-retry', async () => ({
      kind: 'notStartedUnavailable',
    }))
    fresh()
  } finally {
    await contribution?.dispose()
    await replacement?.dispose()
    await h.close()
  }
})

test('R8 service owns execution before host await; caller and host cannot replace input or fence', async () => {
  const h = await serviceHost(),
    entered = latch(),
    resume = latch()
  const supplied = { ...request, run: 'original-run', attempt: 2 }
  const originalAcquire = vi.mocked(h.host.acquireDispatch).getMockImplementation()
  if (originalAcquire === undefined) throw new Error('host fixture missing')
  const inputs: unknown[] = []
  try {
    vi.mocked(h.host.acquireDispatch).mockImplementation(async (requested, signal) => {
      expect(Object.isFrozen(requested)).toBe(true)
      expect(Reflect.set(requested, 'run', 'host-forged-run')).toBe(false)
      entered.resolve()
      await resume.promise
      expect(requested).toMatchObject({ run: 'original-run', attempt: 2 })
      return originalAcquire(requested, signal)
    })
    h.implementations.registerBuiltin('example:a', async input => {
      inputs.push(input)
      return { kind: 'output', value: { kind: 'observed' } }
    })
    h.implementations.registerBuiltin('example:b', async input => {
      inputs.push(input)
      return { kind: 'output', value: { kind: 'observed' } }
    })
    const work = h.runner.dispatch(supplied, new AbortController().signal)
    await entered.promise
    supplied.run = 'caller-forged-run'
    supplied.attempt = 7
    resume.resolve()
    expect(await work).toMatchObject({ effect: { kind: 'proceed' } })
    expect(inputs).toHaveLength(2)
    for (const input of inputs) expect(input).toMatchObject({ run: 'original-run', attempt: 2 })
    const read = await h.log.readSince(unwrap(parseOpaqueIdentifier(session, 'SessionRef')), 0)
    expect(
      'entries' in read && read.entries.map(entry => ({ run: entry.run, attempt: entry.attempt })),
    ).toEqual([
      { run: 'original-run', attempt: 2 },
      { run: 'original-run', attempt: 2 },
    ])
    expect(h.scopes()).toBe(0)
  } finally {
    resume.resolve()
    await h.close()
  }
})

test('R8 service passes the owned actual execution to failure verification after host acquisition', async () => {
  const entered = latch(),
    resume = latch()
  const adaptation = {
    implementation: { name: 'example.family', revision: '1' },
    definition: { modelId: 'example/model', revision: '1' },
    configuration: { revision: '1', values: {} },
  }
  const profile = {
    providers: ['provider-a'],
    allowFallback: true,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 1000,
    maxOutputTokens: 100,
    inputConstraints: {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
    },
    adaptation,
    updatedAt: '2026-09-29T00:00:00Z',
  }
  const failed = judgePositionedSubject({
    position: 'after_model_call',
    dimension: { ending: 'failure' },
    subject: {
      failure: 'upstream_unavailable',
      profile,
      dispatches: [
        {
          adaptation,
          kind: 'model_call_dispatched',
          call: 'failed-call',
          dispatch: 1,
          parameters: {},
          provider: 'provider-a',
          response: 'response',
          profile: { origin: 'official', routeName: 'example/model' },
          profileSnapshot: profile,
          selectedBy: 'session',
          credentialScope: { layer: 'factory' },
        },
      ],
      retryConclusions: [],
    },
  })
  if ('rejected' in failed || failed.ok.position !== 'after_model_call')
    throw new Error('failure fixture invalid')
  const h = await serviceHost()
  const supplied = {
    ...failed.ok,
    manifest: session,
    anchor: 'failed-call',
    run: 'same-run',
    attempt: 2,
  }
  let released = 0
  try {
    vi.mocked(h.execution.verifyFailure).mockImplementation(
      async (subject, actualBinding, execution) => {
        expect(actualBinding).toEqual(h.facts.binding)
        expect(execution).toEqual({ kind: 'withRun', run: 'same-run', attempt: 2 })
        expect(Object.isFrozen(execution)).toBe(true)
        entered.resolve()
        await resume.promise
        expect(execution).toEqual({ kind: 'withRun', run: 'same-run', attempt: 2 })
        return {
          kind: 'verified',
          subject,
          release() {
            released++
          },
        }
      },
    )
    const work = h.runner.dispatch(supplied, new AbortController().signal)
    await entered.promise
    supplied.run = 'other-run'
    supplied.attempt = 9
    resume.resolve()
    expect(await work).toMatchObject({ effect: { kind: 'proceed' }, conclusions: [] })
    expect(released).toBe(1)
    expect(h.operations.append).not.toHaveBeenCalled()
    expect(h.execution.openHandles).not.toHaveBeenCalled()
    expect(h.scopes()).toBe(0)
  } finally {
    resume.resolve()
    await h.close()
  }
})

test('withdrawing the actual runner retains in-flight execution until real stop and never closes its borrowed log', async () => {
  const h = await serviceHost(),
    started = latch(),
    finish = latch()
  try {
    h.implementations.registerBuiltin('example:b', async () => {
      started.resolve()
      await finish.promise
      throw new Error('late rejection')
    })
    const dispatch = h.runner.dispatch(request, new AbortController().signal)
    await started.promise
    let disposed = false
    const closing = h.runnerFiber.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(disposed).toBe(false)
    expect(await dispatch).toEqual({ failure: 'unavailable' })
    expect(h.scopes()).toBe(0)
    finish.resolve()
    await closing
    expect(h.ctx.get('loopExtensionRunner')).toBeUndefined()
    expect(h.ctx.get('loopExtensionImplementations')).toBeUndefined()
    expect(
      await h.log.readSince(unwrap(parseOpaqueIdentifier(session, 'SessionRef')), 0),
    ).toHaveProperty('tail', 0)
  } finally {
    finish.resolve()
    await h.close()
  }
})

test('failure of the second service publication removes the first without closing borrowed log', async () => {
  const h = await serviceHost(),
    ctx = new Context()
  const provider = await ctx.plugin({
    name: 'collision-host',
    apply(inner) {
      inner.provide('sessionLog', h.log)
      new DeniedAccess(inner)
      inner.provide('loopExtensionImplementations', { existing: true })
    },
  })
  new TestHost(ctx, h.host)
  const failed = ctx.plugin(loopExtensionRunnerPlugin, {})
  try {
    await expect(Promise.resolve(failed)).rejects.toThrow()
    expect(ctx.get('loopExtensionRunner')).toBeUndefined()
    expect(ctx.get('loopExtensionImplementations')).toEqual({ existing: true })
    expect(
      await h.log.readSince(unwrap(parseOpaqueIdentifier(session, 'SessionRef')), 0),
    ).toHaveProperty('tail', 0)
  } finally {
    await failed.dispose()
    await provider.dispose()
    await h.close()
  }
})

test('required log dependency removal invalidates retained service and restarts both faces on replacement', async () => {
  const h = await serviceHost()
  let replacement: Awaited<ReturnType<typeof h.ctx.plugin>> | undefined
  try {
    await h.provider.dispose()
    expect(h.ctx.get('loopExtensionRunner')).toBeUndefined()
    expect(h.ctx.get('loopExtensionImplementations')).toBeUndefined()
    expect(h.ctx.get('toolAdmissionPassSource')).toBeUndefined()
    expect(await h.runner.replay(replay)).toEqual({ failure: 'unavailable' })
    expect(() =>
      h.implementations.registerBuiltin('example:a', async () => ({
        kind: 'notStartedUnavailable',
      })),
    ).toThrow()
    replacement = await h.ctx.plugin({
      name: 'replacement-log-provider',
      apply(inner) {
        inner.provide('sessionLog', h.log)
      },
    })
    await h.runnerFiber
    expect(h.ctx.get('loopExtensionRunner')).toBeDefined()
    expect(h.ctx.get('loopExtensionRunner')).not.toBe(h.runner)
    expect(h.ctx.get('loopExtensionImplementations')).not.toBe(h.implementations)
  } finally {
    await replacement?.dispose()
    await h.close()
  }
})

for (const repairFails of [false, true])
  test(`service unknown survives fiber removal until physical stop/reopen (${repairFails ? 'durable original' : 'authoritative absence'})`, async () => {
    const h = await serviceHost()
    const identity = unwrap(parseOpaqueIdentifier(session, 'SessionRef'))
    const fault = sqlJournalFault(join(h.dir, 'journal.sqlite'), repairFails)
    try {
      await h.log.append(
        identity,
        [{ tenant: h.facts.binding.tenant, readKeys: [], payload: 'warmup' }],
        { kind: 'unfenced' },
        { kind: 'unconditional' },
      )
      const invoked = vi.fn(async () => ({ kind: 'output' as const, value: { kind: 'observed' } }))
      h.implementations.registerBuiltin('example:b', invoked)
      fault.arm()
      expect(await h.runner.dispatch(request, new AbortController().signal)).toEqual({
        failure: 'unavailable',
      })
      expect(fault.failures()).toBeGreaterThan(0)
      expect(h.owner.hasUnknown(h.facts.binding)).toBe(true)
      fault.clear()
      await h.runnerFiber.dispose()
      expect(h.owner.hasUnknown(h.facts.binding)).toBe(true)
      // Trusted physical stop precedes recovery admission; the service never does this itself.
      h.owner.closeAdmission()
      await h.log.close()
      const recovered = await openSqlLogFixture({
        dir: {
          ...h.logOptions,
          processOwnership: {
            current: 'runner-service-recovery-test',
            observeExit: async () => 'exited',
          },
        }.dir,
      })
      try {
        const readByKey = async (key: string) => {
          const read = await recovered.readByKey(identity, key)
          return 'entries' in read ? read.entries : { unavailable: true as const }
        }
        expect(
          await h.owner.reconcileStoppedLog({
            binding: { ...h.facts.binding, logGeneration: 'wrong_generation' },
            readByKey,
          }),
        ).toEqual({ unavailable: true })
        expect(h.owner.hasUnknown(h.facts.binding)).toBe(true)
        expect(
          await h.owner.reconcileStoppedLog({ binding: h.facts.binding, readByKey }),
        ).toMatchObject([{ kind: repairFails ? 'same' : 'absent' }])
        await h.owner.drain()
        expect(h.owner.hasUnknown(h.facts.binding)).toBe(false)
        expect(invoked).toHaveBeenCalledOnce()
      } finally {
        await recovered.close()
      }
    } finally {
      fault.clear()
      fault.close()
      await h.close()
    }
  })

test('two actual service dispatchers adopt the legal durable winner rather than requiring byte-identical candidates', async () => {
  const h = await serviceHost(),
    entered = latch()
  let firstCount = 0,
    time = 0
  try {
    vi.mocked(h.execution.now).mockImplementation(() => `2026-09-29T00:00:0${time++}Z`)
    h.implementations.registerBuiltin('example:b', async () => {
      if (++firstCount === 2) entered.resolve()
      await entered.promise
      return { kind: 'output', value: { kind: 'observed' } }
    })
    h.implementations.registerBuiltin('example:a', async () => ({
      kind: 'output',
      value: { kind: 'observed' },
    }))
    const results = await Promise.all([
      h.runner.dispatch(request, new AbortController().signal),
      h.runner.dispatch(request, new AbortController().signal),
    ])
    expect(firstCount).toBe(2)
    expect(results[0]).toMatchObject({
      conclusions: [{ extension: 'example:b' }, { extension: 'example:a' }],
    })
    expect(results[1]).toEqual(results[0])
    expect(
      await h.log.readSince(unwrap(parseOpaqueIdentifier(session, 'SessionRef')), 0),
    ).toHaveProperty('tail', 2)
  } finally {
    entered.resolve()
    await h.close()
  }
})

test('runner fiber can withdraw while the shared owner retains an already admitted delayed physical append', async () => {
  const h = await serviceHost(),
    entered = latch(),
    finish = latch()
  let drained = false
  try {
    h.implementations.registerBuiltin('example:b', async () => ({
      kind: 'output',
      value: { kind: 'observed' },
    }))
    h.operations.append.mockImplementation(async (...args) => {
      entered.resolve()
      await finish.promise
      return h.log.append(...args)
    })
    const dispatch = h.runner.dispatch(request, new AbortController().signal)
    await entered.promise
    await h.runnerFiber.dispose()
    expect(await dispatch).toEqual({ failure: 'unavailable' })
    h.owner.closeAdmission()
    const draining = h.owner.drain().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    finish.resolve()
    await draining
    expect(
      await h.log.readSince(unwrap(parseOpaqueIdentifier(session, 'SessionRef')), 0),
    ).toHaveProperty('tail', 1)
  } finally {
    finish.resolve()
    await h.close()
  }
})

class TestHost extends RunnerHostService {
  constructor(
    ctx: Context,
    private readonly operations: RunnerServiceHost,
  ) {
    super(ctx)
  }
  acquireDispatch(...args: Parameters<RunnerServiceHost['acquireDispatch']>) {
    return this.operations.acquireDispatch(...args)
  }
  acquireReplay(...args: Parameters<RunnerServiceHost['acquireReplay']>) {
    return this.operations.acquireReplay(...args)
  }
}
