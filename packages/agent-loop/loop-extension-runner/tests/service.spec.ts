import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { judgePositionedSubject } from '@omne-harness-lite/loop-extension'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { createModelDefaultRetryPlugin } from '@omne-harness-lite/model-request-runtime/default-retry-plugin'
import {
  createRunnerTaskOwner,
  loopExtensionRunnerPlugin,
  type RunnerServiceHost,
  type RunnerImplementations,
  type LoopExtensionRunnerService,
  type RunnerDispatchRequest,
  type RunnerExecutionPorts,
} from '../src/index.ts'
import { chainHost, session } from './runner-chain-support.ts'

const positioned = judgePositionedSubject({
  position: 'before_model_call',
  subject: { request: { target: 'example/model', parameters: {}, messages: [], tools: [] } },
})
if ('rejected' in positioned) throw new Error('fixture subject invalid')
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
  const log = await openJsonlSessionLog({
    dir,
    processOwnership: { current: 'runner-service-test', observeExit: async () => 'exited' },
  })
  const owner = createRunnerTaskOwner(facts.binding)
  const ctx = new Context()
  const provider = await ctx.plugin({
    name: 'actual-log',
    apply(inner) {
      inner.provide('sessionLog', log)
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
    verifyFailure: vi.fn(async () => ({ kind: 'unavailable' as const })),
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
  const runnerFiber = await ctx.plugin(loopExtensionRunnerPlugin, { host: () => host })
  const runner = ctx.get('loopExtensionRunner') as LoopExtensionRunnerService
  const implementations = ctx.get('loopExtensionImplementations') as RunnerImplementations
  return {
    facts,
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
      await log.close()
      await owner.drain()
      await facts.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

test('Cordis service dispatches a real manifest chain into JSONL; replay reads without invoking, guarding, handles, time or writes', async () => {
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
    expect(await h.runner.replay(replay)).toMatchObject([
      { extension: 'example:b' },
      { extension: 'example:a' },
    ])
    expect(invoke).not.toHaveBeenCalled()
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
    const contribution = await h.ctx.plugin(
      createModelDefaultRetryPlugin({ policy, sample: () => 0.5 }),
      {},
    )
    const duplicate = h.ctx.plugin(createModelDefaultRetryPlugin({ policy, sample: () => 0.5 }), {})
    await expect(Promise.resolve(duplicate)).rejects.toThrow()
    expect(() =>
      h.implementations.registerBuiltin('omne-official:default-retry', async () => ({
        kind: 'notStartedUnavailable',
      })),
    ).toThrow()
    await duplicate.dispose()
    await contribution.dispose()
    const next = await h.ctx.plugin(
      createModelDefaultRetryPlugin({ policy, sample: () => 0.5 }),
      {},
    )
    await next.dispose()
  } finally {
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
      inner.provide('loopExtensionImplementations', { existing: true })
    },
  })
  const failed = ctx.plugin(loopExtensionRunnerPlugin, { host: () => h.host })
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
