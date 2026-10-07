import { expect, test, vi } from 'vitest'
import { createToolRuntime, createToolInvoker } from '@omne-harness-lite/tool-execution-local'
import {
  createParameterJudge,
  isToolReturn,
  type ToolReturn,
} from '@omne-harness-lite/tool-definition'
import {
  TOOL_RUNTIME_REGISTRY,
  TOOL_RESULTS,
} from '@omne-harness-lite/tool-execution-runtime/cordis'
import {
  prepareToolJournalEntry,
  projectToolJournal,
  type ExecutionSubmission,
  type ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import {
  scope,
  origin,
  tool,
  completeActions,
  type historyFixture,
  type FixtureTool,
} from './tool-driver-history-fixture.ts'
import type {} from '@omne-harness-lite/execution-environments/cordis'
import { EXECUTION_ENVIRONMENTS } from '@omne-harness-lite/execution-environments/cordis'
import {
  environmentToolOf,
  type ToolRuntimeDependencies,
} from '@omne-harness-lite/tool-execution-runtime'
import type { EnvironmentAdoption } from '@omne-harness-lite/execution-environments'
import type { Context } from '@deepseek-ai/cordis'
import { copyJsonValue, type JsonValue } from '@omne-harness-lite/content-blocks'
import { compareInteger, type OwnedLogEntry } from '@omne-harness-lite/session-log'

const config = {
  resultStorage: 'integration-results',
  frameQueueBytes: 1048576,
  tailRetry: { attempts: 3, minDelayMs: 0, maxDelayMs: 0 },
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
async function requestOf(
  f: Awaited<ReturnType<typeof actionIntegrationFixture>>,
): Promise<ExecutionSubmission> {
  const completed = await f.dispatch()
  if (completed.kind !== 'complete') throw new Error(JSON.stringify(completed))
  return {
    access: f.current.toolAccess,
    scope,
    origin,
    adoption: f.f.adoption,
    call: f.f.calls[0]!,
    admissionToken: completed.admissions[0]!.token,
  }
}
async function history(f: Awaited<ReturnType<typeof actionIntegrationFixture>>) {
  const projected = projectToolJournal(scope, (await f.f.prefix()).entries)
  if ('invalid' in projected) throw new Error('tool history invalid')
  return projected.executions.get(f.f.calls[0]!.callId)!
}
async function cold(
  f: Awaited<ReturnType<typeof historyFixture>>,
  waiting = false,
  environment?: { readonly tool: FixtureTool; readonly adoption: EnvironmentAdoption },
) {
  await completeActions(f)
  const ref = { ...scope, callId: f.calls[0]!.callId }
  const values: ToolJournalPayload[] = [
    {
      kind: 'execution_intended',
      revision: 1,
      ref,
      origin,
      selected: {
        capability: (environment?.tool ?? tool).capability,
        asset: (environment?.tool ?? tool).asset,
        version: (environment?.tool ?? tool).version,
        definition: (environment?.tool ?? tool).definition,
        adoption: f.adoption,
      },
      input: {
        format: 'tool-input/1',
        acceptedAt: '2026-10-04T00:00:00Z',
        chain: [],
        pass: 'cold-after-action',
      },
    },
  ]
  if (waiting)
    values.push(
      { kind: 'execution_started', revision: 1, ref, at: '2026-10-04T00:00:00Z' },
      ...(environment
        ? [
            {
              kind: 'execution_environment_adopted',
              revision: 1,
              ref,
              adoption: environment.adoption,
            } as const,
          ]
        : []),
      {
        kind: 'execution_waiting',
        revision: 1,
        ref,
        waitIndex: 1,
        request: { prompt: 'question', answerSchema: { type: 'string' } },
      },
    )
  await f.append(
    values.map(value => {
      const prepared = prepareToolJournalEntry({ value, origin })
      if ('invalid' in prepared) throw new Error('cold fixture value invalid')
      return prepared.entry
    }),
  )
}

function dependencies(
  f: Awaited<ReturnType<typeof actionIntegrationFixture>>,
): ToolRuntimeDependencies {
  const ctx = f.current.assembly.ctx
  return {
    recovery: f.current.owner.recovery,
    owner: f.current.owner.operations,
    backing: ctx.sessionLogBacking,
    history: ctx.toolActionHistory,
    authorization: ctx.sessionAccess,
    context: ctx.runtimeContext,
    environments: ctx.executionEnvironments,
    results: ctx.toolResults,
    implementations: ctx.toolImplementations,
    admission: () => f.current.admission,
    runnerHost: ctx.runnerHost,
    clock: ctx.clock,
    invoke: createToolInvoker({
      parameters: createParameterJudge(),
      judgeResult: value =>
        isToolReturn(value) ? { kind: 'valid', result: value as ToolReturn } : { kind: 'invalid' },
    }),
  }
}

test('real Cordis runtime executes once through official admission and makes the actual file result readable', async () => {
  const executor = vi.fn(async () => '{"remains":"text"}')
  const f = await actionIntegrationFixture({ executor })
  try {
    const runtime = f.current.assembly.ctx.get(TOOL_RUNTIME_REGISTRY)!,
      results = f.current.assembly.ctx.get(TOOL_RESULTS)!,
      request = await requestOf(f)
    const submitted = await runtime.submit(request)
    expect(submitted).toMatchObject({ kind: 'recorded' })
    if (submitted.kind !== 'recorded') throw new Error(JSON.stringify(submitted))
    const acquired = await runtime.acquire(request.access, submitted.execution)
    if (acquired.kind !== 'acquired') throw new Error(JSON.stringify(acquired))
    const ended = await acquired.observer.waitForEnd()
    expect(ended).toMatchObject({
      kind: 'found',
      snapshot: {
        state: { phase: 'ended', terminal: { outcome: 'completed', result: '{"remains":"text"}' } },
      },
    })
    expect(await results.readResult(request.access, submitted.execution)).toMatchObject({
      kind: 'found',
      value: { result: { content: [{ text: '{"remains":"text"}' }] } },
    })
    expect(await runtime.submit(request)).toEqual(submitted)
    expect(executor).toHaveBeenCalledTimes(1)
    expect((await history(f)).terminal?.value.delivery.selectedChain).toMatchObject([
      { definition: { position: 'before_action' } },
    ])
    acquired.observer.release()
    await f.reopen()
    const replayed = await f.current.assembly.ctx.toolRuntimeRegistry.acquire(
      f.current.toolAccess,
      submitted.execution,
    )
    expect(replayed.kind).toBe('acquired')
    if (replayed.kind === 'acquired') {
      expect(await replayed.observer.waitForEnd()).toMatchObject({
        snapshot: { state: { phase: 'ended', terminal: { outcome: 'completed' } } },
      })
      replayed.observer.release()
    }
    expect(executor).toHaveBeenCalledTimes(1)
  } finally {
    await f.close()
  }
})

test('observer release and contribution withdrawal leave an entered pure closure alive; provider withdrawal stops old handles', async () => {
  const entered = deferred<void>(),
    returned = deferred<string>()
  const f = await actionIntegrationFixture({
    executor: async () => {
      entered.resolve()
      return returned.promise
    },
  })
  try {
    const runtime = f.current.assembly.ctx.toolRuntimeRegistry,
      request = await requestOf(f),
      submitted = await runtime.submit(request)
    if (submitted.kind !== 'recorded') throw new Error(JSON.stringify(submitted))
    const first = await runtime.acquire(request.access, submitted.execution),
      second = await runtime.acquire(request.access, submitted.execution)
    if (first.kind !== 'acquired' || second.kind !== 'acquired')
      throw new Error('observers unavailable')
    await entered.promise
    first.observer.release()
    const contribution = f.current.assembly.fibers.at(-2)!
    await contribution.dispose()
    expect(await second.observer.read()).toMatchObject({
      snapshot: { state: { phase: 'running' } },
    })
    returned.resolve('finished')
    expect(await second.observer.waitForEnd()).toMatchObject({
      snapshot: { state: { terminal: { outcome: 'completed' } } },
    })
    const provider = f.current.assembly.fibers.at(-1)!
    await provider.dispose()
    expect(await second.observer.read()).toMatchObject({ reason: 'ownerStopped' })
    expect(await runtime.acquire(request.access, submitted.execution)).toMatchObject({
      reason: 'runtimeUnavailable',
    })
    expect(await f.f.log.readSince(scope.session, 0)).toHaveProperty('entries')
  } finally {
    returned.resolve('finished')
    await f.close()
  }
})

test('disposing an actual Cordis consumer releases only its observer while the admitted author continues', async () => {
  const entered = deferred<void>(),
    returned = deferred<void>()
  const executor = vi.fn(async () => {
    entered.resolve()
    await returned.promise
    return 'survived-consumer-disposal'
  })
  const f = await actionIntegrationFixture({ executor })
  let consumer: import('@deepseek-ai/cordis').Fiber | undefined
  try {
    const request = await requestOf(f),
      runtime = f.current.assembly.ctx.toolRuntimeRegistry
    const submitted = await runtime.submit(request)
    if (submitted.kind !== 'recorded') throw new Error('actual tool submission unavailable')
    await entered.promise
    const scoped =
      Promise.withResolvers<import('@omne-harness-lite/tool-execution-runtime').ExecutionObserver>()
    consumer = f.current.assembly.ctx.plugin({
      inject: [TOOL_RUNTIME_REGISTRY],
      async apply(ctx) {
        const acquired = await ctx.toolRuntimeRegistry.acquire(request.access, submitted.execution)
        if (acquired.kind !== 'acquired') throw new Error('consumer observation unavailable')
        scoped.resolve(acquired.observer)
      },
    })
    await consumer
    const observer = await scoped.promise,
      waiting = observer.waitForEnd()
    await consumer.dispose()
    expect(await waiting).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    expect((await history(f)).terminal).toBeUndefined()
    expect(executor).toHaveBeenCalledTimes(1)
    const next = await runtime.acquire(request.access, submitted.execution)
    if (next.kind !== 'acquired') throw new Error('independent observer cannot reattach')
    returned.resolve()
    try {
      expect(await next.observer.waitForEnd()).toMatchObject({
        kind: 'found',
        snapshot: {
          state: { terminal: { outcome: 'completed', result: 'survived-consumer-disposal' } },
        },
      })
      expect(executor).toHaveBeenCalledTimes(1)
    } finally {
      next.observer.release()
    }
  } finally {
    returned.resolve()
    await consumer?.dispose()
    await f.close()
  }
})

test('a bound result receipt survives later business revocation while new reads are denied', async () => {
  const entered = deferred<void>(),
    returned = deferred<string>()
  const f = await actionIntegrationFixture({
    executor: async () => {
      entered.resolve()
      return returned.promise
    },
  })
  try {
    const runtime = f.current.assembly.ctx.toolRuntimeRegistry,
      request = await requestOf(f),
      submitted = await runtime.submit(request)
    if (submitted.kind !== 'recorded') throw new Error(JSON.stringify(submitted))
    await entered.promise
    f.current.revoke()
    returned.resolve('authorized receipt')
    // Poll the durable owner, not a revoked business observer.
    for (let n = 0; n < 100 && !(await history(f)).terminal; n++)
      await new Promise(done => setTimeout(done, 5))
    expect((await history(f)).terminal?.value.terminal).toEqual({
      outcome: 'completed',
      result: 'authorized receipt',
    })
    expect(
      await f.current.assembly.ctx.toolResults.readResult(request.access, submitted.execution),
    ).toMatchObject({ reason: 'notAuthorized' })
    f.current.restore()
    expect(
      await f.current.assembly.ctx.toolResults.readResult(request.access, submitted.execution),
    ).toHaveProperty('kind', 'found')
  } finally {
    f.current.restore()
    returned.resolve('authorized receipt')
    await f.close()
  }
})

test.each([false, true])(
  'cold recovery ends %s waiting execution without replaying the author or inventing known cost',
  async waiting => {
    const executor = vi.fn(async () => 'must not run')
    const f = await actionIntegrationFixture({
      executor,
      beforeRuntime: fixture => cold(fixture, waiting),
    })
    try {
      const execution = await history(f)
      expect(execution.terminal?.value).toMatchObject({
        terminal: { outcome: 'failed', code: 'abnormal_interruption' },
        account: { frames: 'unknown', cost: { total_usd: 'unknown' } },
      })
      expect(executor).not.toHaveBeenCalled()
      expect(execution.waiting).toBeUndefined()
    } finally {
      await f.close()
    }
  },
)

test('public construction gates operations until the complete maintenance scan resolves and never leaks authority in config', async () => {
  const f = await actionIntegrationFixture({ executor: async () => 'root', installRuntime: false })
  const gate = deferred<void>(),
    ctx = f.current.assembly.ctx
  const runtime = createToolRuntime(config, {
    ...dependencies(f),
    owner: {
      ...f.current.owner.operations,
      async enumerate(access) {
        await gate.promise
        return f.current.owner.operations.enumerate(access)
      },
    },
  })
  try {
    expect(
      await runtime.operations.acquire(f.current.toolAccess, {
        ...scope,
        callId: unwrap(parseOpaqueIdentifier('call', 'CallId')),
      }),
    ).toMatchObject({ reason: 'runtimeNotReady' })
    gate.resolve()
    await runtime.ready
    const submitted = await runtime.operations.submit(await requestOf(f))
    expect(submitted.kind).toBe('recorded')
    await runtime.idle()
  } finally {
    gate.resolve()
    await runtime.close()
    await f.close()
  }
})

test('unconfirmed resource cleanup prevents readiness and retains the actual journal borrow for a later close retry', async () => {
  const executor = vi.fn(async () => 'never replay'),
    resource = {
      key: 'cold-resource',
      provider: 'fixture-resource-owner',
      reference: { ownership: 'fixture-scope' },
    }
  const coldTool: FixtureTool = {
    ...tool,
    definition: {
      ...tool.definition,
      settings: {
        targetEnvironment: {
          category: 'placement_identity',
          default: {
            bindingLayer: 'host_machine',
            facilities: ['command'],
          },
        },
      },
    },
  }
  const f = await actionIntegrationFixture({
    executor,
    adoptedTool: coldTool,
    installRuntime: false,
    async beforeRuntime(fixture) {
      const ref = { ...scope, callId: fixture.calls[0]!.callId }
      await cold(fixture, true, {
        tool: coldTool,
        adoption: {
          placement: {
            scope,
            execution: ref.callId,
            tool: environmentToolOf({ ...coldTool, adoption: fixture.adoption }),
            requirement: { bindingLayer: 'host_machine', facilities: ['command'] },
            permission: 'always-allow',
            revision: 'cold-input',
            evidence: null,
          },
          source: { name: 'cold-source', generation: 'original' },
          description: {
            reference: { provider: resource.provider, reference: 'original' },
            bindingLayer: 'host_machine',
            binding: { kind: 'host_machine' },
            facilities: ['command'],
            instance: { id: 'original', generation: 'one' },
            continuity: { kind: 'notGuaranteed' },
          },
          providerEvidence: null,
        },
      })
      for (const value of [
        { kind: 'resource_planned', revision: 1, ref, resource },
        { kind: 'resource_permitted', revision: 1, ref, key: resource.key },
      ] as const) {
        const entry = prepareToolJournalEntry({ value, origin })
        if ('invalid' in entry) throw new Error('resource fixture invalid')
        await fixture.append([entry.entry])
      }
    },
  })
  let confirmed = false
  const recover = vi.fn(async () => ({
    status: confirmed ? ('confirmedStopped' as const) : ('pending' as const),
  }))
  const fiber = f.current.assembly.ctx.plugin({
    name: 'fixture-resource-owner',
    inject: [EXECUTION_ENVIRONMENTS],
    apply(ctx: Context) {
      ctx.executionEnvironments.registerProvider({
        name: resource.provider,
        generation: 'resource-generation',
        describe: async () => ({ kind: 'descriptions', values: [] }),
        acquire: async () => ({ kind: 'rejected', reason: 'noMatchingEnvironment' }),
        listRecoveryResources: async () => ({ kind: 'resources', values: [] }),
        recover,
        retire: async () => ({ kind: 'drained' }),
      })
    },
  })
  await fiber
  const before = f.current.backing.retained,
    runtime = createToolRuntime(config, dependencies(f))
  try {
    await expect(runtime.ready).rejects.toThrow('unconfirmed resource cleanup')
    expect((await history(f)).terminal).toBeUndefined()
    await expect(runtime.close()).rejects.toThrow('unconfirmed resource cleanup')
    expect(f.current.backing.retained).toBe(before + 1)
    confirmed = true
    await runtime.close()
    expect(f.current.backing.retained).toBe(before)
    const execution = await history(f)
    expect(execution.resources.get(resource.key)?.observations.at(-1)?.value.status).toBe(
      'confirmed',
    )
    expect(execution.terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
    const stopped = execution.resources.get(resource.key)?.observations.at(-1)
    if (!stopped) throw new Error('Confirmed physical stop record missing')
    expect(compareInteger(stopped.entry.position, execution.terminal!.entry.position)).toBe(-1)
    expect(executor).not.toHaveBeenCalled()
    expect(recover).toHaveBeenCalledTimes(3)
  } finally {
    confirmed = true
    await runtime.close()
    await fiber.dispose()
    await f.close()
  }
})

test('zero frame capacity records an actual quota trim without changing a successful author result', async () => {
  const f = await actionIntegrationFixture({
    frameQueueBytes: 0,
    executor: async (_args, ports) => {
      expect(
        ports.frames.emit({
          t: 'open',
          index: 0,
          kind: 'text',
          fill: 'append',
          id: unwrap(parseOpaqueIdentifier('frame-text', 'BlockId')),
          visibility: { toHuman: true, toModel: false },
        }),
      ).toEqual({ kind: 'dropped', why: 'capacity' })
      return 'ordinary result'
    },
  })
  try {
    const runtime = f.current.assembly.ctx.toolRuntimeRegistry,
      request = await requestOf(f),
      submitted = await runtime.submit(request)
    if (submitted.kind !== 'recorded') throw new Error(JSON.stringify(submitted))
    const observed = await runtime.acquire(request.access, submitted.execution)
    if (observed.kind !== 'acquired') throw new Error(JSON.stringify(observed))
    expect(await observed.observer.waitForEnd()).toMatchObject({
      snapshot: {
        state: {
          terminal: { outcome: 'completed' },
          account: { frames: { trims: { byReason: { quota_exhausted: 1 } } } },
        },
      },
    })
    observed.observer.release()
  } finally {
    await f.close()
  }
})

test('startup scans and terminates an observerless second session, rather than recovering only the active session', async () => {
  const second = {
      ...scope,
      session: unwrap(parseOpaqueIdentifier('observerless-session', 'SessionRef')),
    },
    executor = vi.fn(async () => 'no replay')
  const f = await actionIntegrationFixture({
    executor,
    ownedScopes: [scope, second],
    async beforeRuntime(fixture) {
      await cold(fixture, true)
      // Two valid independent session histories with the same tenant. No observer is acquired in the second.
      function relocate(value: JsonValue): JsonValue {
        if (value === scope.session) return second.session
        if (Array.isArray(value)) return value.map(relocate)
        if (value !== null && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, relocate(item)]),
          )
        return value
      }
      const original = await fixture.prefix()
      const entries = original.entries.map(
        ({ session: _session, position: _position, ...entry }) => {
          const copied = copyJsonValue(entry)
          if ('failed' in copied) throw new Error('fixture copy failed')
          return relocate(copied.ok) as unknown as OwnedLogEntry
        },
      )
      const appended = await fixture.log.append(
        second.session,
        entries,
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: 0 },
      )
      if ('failure' in appended) throw new Error(appended.failure)
    },
  })
  try {
    const prefix = await f.f.log.readSince(second.session, 0)
    if ('failure' in prefix) throw new Error(prefix.failure)
    const projected = projectToolJournal(second, prefix.entries)
    if ('invalid' in projected) throw new Error('second session history invalid')
    expect(projected.executions.get('call')?.terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
    expect((await history(f)).terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
    expect(executor).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('actual issuer tokens reject forged, cross-session, cross-tenant and revoked runtime operations without changing history', async () => {
  const entered = deferred<void>(),
    returned = deferred<string>()
  const executor = vi.fn(async () => {
    entered.resolve()
    return returned.promise
  })
  const f = await actionIntegrationFixture({ executor })
  try {
    const runtime = f.current.assembly.ctx.toolRuntimeRegistry
    const request = await requestOf(f)
    const submitted = await runtime.submit(request)
    if (submitted.kind !== 'recorded') throw new Error('submission failed')
    const originalObserver = await runtime.acquire(request.access, submitted.execution)
    if (originalObserver.kind !== 'acquired') throw new Error('observer failed')
    await entered.promise
    const before = await f.f.prefix()
    const foreignTenant = {
      ...scope.tenant,
      account: unwrap(parseOpaqueIdentifier('foreign-account', 'AccountId')),
    }
    const candidates = [
      { access: { ...request.access }, scope },
      {
        access: request.access,
        scope: { ...scope, session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')) },
      },
      { access: request.access, scope: { ...scope, tenant: foreignTenant } },
    ]
    async function rejected(candidate: (typeof candidates)[number]) {
      const ref = {
        ...candidate.scope,
        callId: submitted.kind === 'recorded' ? submitted.execution.callId : request.call.callId,
      }
      expect(await runtime.submit({ ...request, ...candidate })).toMatchObject({
        reason: 'notAuthorized',
      })
      expect(await runtime.acquire(candidate.access, ref)).toMatchObject({
        reason: 'notAuthorized',
      })
      expect(await runtime.stop(candidate.access, ref, 'forbidden')).toBe('notAuthorized')
      expect(
        await f.current.assembly.ctx.toolResults.readResult(candidate.access, ref),
      ).toMatchObject({ reason: 'notAuthorized' })
      // The waiting increment is not implemented. It must not fabricate an accepted answer.
      expect(await runtime.answer(candidate.access, ref, 1, 'forged response')).toBe('unavailable')
    }
    for (const candidate of candidates) await rejected(candidate)
    f.current.revoke()
    await rejected({ access: request.access, scope })
    expect(await originalObserver.observer.read()).toMatchObject({ reason: 'notAuthorized' })
    expect(await f.f.prefix()).toEqual(before)
    expect(executor).toHaveBeenCalledOnce()
    f.current.restore()
    returned.resolve('original author')
    expect(await originalObserver.observer.waitForEnd()).toMatchObject({
      snapshot: { state: { terminal: { outcome: 'completed', result: 'original author' } } },
    })
    originalObserver.observer.release()
  } finally {
    f.current.restore()
    returned.resolve('original author')
    await f.close()
  }
})

test('replacing an actual implementation contribution cannot rewrite an execution that already adopted its closure', async () => {
  const entered = deferred<void>(),
    returned = deferred<string>()
  const oldExecutor = vi.fn(async () => {
    entered.resolve()
    return returned.promise
  })
  const replacementExecutor = vi.fn(async () => 'replacement result')
  const f = await actionIntegrationFixture({ executor: oldExecutor })
  try {
    const ctx = f.current.assembly.ctx
    const request = await requestOf(f)
    const submitted = await ctx.toolRuntimeRegistry.submit(request)
    if (submitted.kind !== 'recorded') throw new Error('submission failed')
    const acquired = await ctx.toolRuntimeRegistry.acquire(request.access, submitted.execution)
    if (acquired.kind !== 'acquired') throw new Error('observer failed')
    await entered.promise
    const intended = (await history(f)).intent
    await f.current.assembly.fibers.at(-2)!.dispose()
    const replacement = ctx.plugin({
      name: 'replacement-tool-contribution',
      inject: ['toolImplementations'],
      apply(inner: Context) {
        inner.toolImplementations.register({
          ...tool,
          definition:
            tool.definition as import('@omne-harness-lite/tool-definition').ToolDefinition,
          executor: replacementExecutor,
        })
      },
    })
    await replacement
    try {
      if (!intended.value.selected) throw new Error('durable selected implementation missing')
      const current = ctx.toolImplementations.acquire(intended.value.selected)
      if (!('implementation' in current)) throw new Error('replacement missing')
      expect(current.implementation.executor).toBe(replacementExecutor)
      current.release()
      returned.resolve('adopted result')
      expect(await acquired.observer.waitForEnd()).toMatchObject({
        snapshot: { state: { terminal: { outcome: 'completed', result: 'adopted result' } } },
      })
      expect((await history(f)).intent).toEqual(intended)
      expect(oldExecutor).toHaveBeenCalledOnce()
      expect(replacementExecutor).not.toHaveBeenCalled()
      acquired.observer.release()
    } finally {
      await replacement.dispose()
    }
  } finally {
    returned.resolve('adopted result')
    await f.close()
  }
})
