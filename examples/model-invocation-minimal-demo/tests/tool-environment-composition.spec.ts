// @module-tag slow
import { expect, test, vi } from 'vitest'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { projectToolJournal, type ToolExecutor } from '@omne-harness-lite/tool-execution-runtime'
import { toolEnvironmentPlacement } from '@omne-harness-lite/tool-execution-local/cordis'
import type {
  CommandOutcome,
  EnvironmentProvider,
  ManagedResource,
} from '@omne-harness-lite/execution-environments'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'
import { origin, scope, tool, toolCall, type FixtureTool } from './tool-driver-history-fixture.ts'

const environmentTool: FixtureTool = {
  ...tool,
  capability: capabilityCanonicalString({ category: 'tool', name: tool.name }),
  definition: {
    ...tool.definition,
    input: {
      type: 'object',
      properties: { call: { type: 'string', description: 'Call identity' } },
      description: 'Input',
    },
    settings: {
      targetEnvironment: {
        category: 'placement_identity',
        default: { bindingLayer: 'host_machine', facilities: ['command'] },
      },
    },
  },
}
const completed: CommandOutcome = {
  kind: 'completed',
  exit: { code: 0 },
  durationMs: 1,
  output: {
    stdout: { observedBytes: 13, discardedBytes: 0 },
    stderr: { observedBytes: 0, discardedBytes: 0 },
  },
}
function controlledProvider() {
  const acquired: string[] = [],
    entered: string[] = [],
    release = vi.fn(async () => ({ kind: 'released' }) as const),
    finished = new Map<string, ReturnType<typeof Promise.withResolvers<CommandOutcome>>>(),
    invalidated = Promise.withResolvers<{ reason: string }>()
  const description = {
    reference: { provider: 'controlled', reference: 'original' },
    bindingLayer: 'host_machine' as const,
    binding: { kind: 'host_machine' as const },
    facilities: ['command'],
    instance: { id: 'original', generation: 'one' },
    continuity: { kind: 'notGuaranteed' as const },
  }
  const provider: EnvironmentProvider = {
    name: 'controlled',
    generation: 'one',
    describe: async () => ({ kind: 'descriptions', values: [description] }),
    acquire: async request => {
      acquired.push(request.call.execution)
      const result = Promise.withResolvers<CommandOutcome>()
      finished.set(request.call.execution, result)
      const resource: ManagedResource = {
        key: `process/${request.call.execution}`,
        provider: 'controlled',
        reference: { call: request.call.execution },
      }
      let started = false
      return {
        kind: 'acquired',
        evidence: { original: request.call.execution },
        lease: {
          invalidated: invalidated.promise,
          facilities: {
            description,
            command: {
              async start() {
                if (
                  (await request.resources.plan(resource)) !== 'recorded' ||
                  (await request.resources.permit(resource.key)) !== 'confirmed'
                )
                  return { kind: 'rejected', reason: 'closed' }
                started = true
                entered.push(request.call.execution)
                return {
                  kind: 'started',
                  process: {
                    output: {
                      async *[Symbol.asyncIterator]() {
                        yield {
                          stream: 'stdout' as const,
                          data: new TextEncoder().encode('actual-output'),
                        }
                      },
                    },
                    result: result.promise,
                    outputPolicy: { maxBufferedBytes: 128, maxChunkBytes: 64, overflow: 'discard' },
                    stop: async () => {
                      result.resolve(completed)
                      return 'confirmed'
                    },
                  },
                }
              },
              createTerminal: async () => ({ kind: 'rejected', reason: 'unsupported' }),
              executeTerminal: async () => ({ kind: 'rejected', reason: 'unsupported' }),
              closeTerminal: async () => ({ kind: 'rejected', reason: 'unsupported' }),
              terminals: async () => ({ kind: 'rejected', reason: 'unsupported' }),
            },
          },
          async release() {
            result.resolve(completed)
            if (started) await request.resources.stopped(resource.key, 'confirmed')
            return release()
          },
        },
      }
    },
    listRecoveryResources: async () => ({ kind: 'resources', values: [] }),
    recover: async () => ({ status: 'confirmedStopped' }),
    retire: async () => ({ kind: 'drained' }),
  }
  return { provider, acquired, entered, finished, invalidated, release }
}
async function submit(f: Awaited<ReturnType<typeof actionIntegrationFixture>>, index = 0) {
  const dispatched = await f.dispatch()
  if (dispatched.kind !== 'complete') throw new Error(JSON.stringify(dispatched))
  const result = await f.current.assembly.ctx.toolRuntimeRegistry.submit({
    access: f.current.toolAccess,
    scope,
    origin,
    adoption: f.f.adoption,
    call: f.f.calls[index]!,
    admissionToken: dispatched.admissions[index]!.token,
  })
  if (result.kind !== 'recorded') throw new Error(JSON.stringify(result))
  const observation = await f.current.assembly.ctx.toolRuntimeRegistry.acquire(
    f.current.toolAccess,
    result.execution,
  )
  if (observation.kind !== 'acquired') throw new Error(JSON.stringify(observation))
  return { result, observer: observation.observer }
}

test('SQL current inputs, Cordis placement/registry and durable owner inject the original command and return its streamed output', async () => {
  const p = controlledProvider(),
    seen: string[] = []
  let f: Awaited<ReturnType<typeof actionIntegrationFixture>>
  const executor = vi.fn<ToolExecutor>(async (_args, dependencies) => {
    const projected = projectToolJournal(scope, (await f.f.prefix()).entries)
    if ('invalid' in projected) throw new Error('Actual durable history invalid')
    expect(projected.executions.get('call')?.environment?.value.adoption).toMatchObject({
      placement: { permission: 'always-allow', execution: 'call' },
      source: { name: 'environment-fixture' },
      description: { instance: { id: 'original', generation: 'one' } },
    })
    const command = await dependencies.environment?.command?.start({
      executable: 'controlled',
      args: [],
      cwd: '/controlled',
      env: {},
    })
    if (!command || command.kind !== 'started') throw new Error('Command not injected')
    for await (const chunk of command.process.output)
      seen.push(new TextDecoder().decode(chunk.data))
    p.finished.get('call')!.resolve(completed)
    await command.process.result
    return seen.join('')
  })
  f = await actionIntegrationFixture({
    executor,
    environment: { tool: environmentTool, providers: [p.provider] },
  })
  try {
    expect(await f.environmentInputs!.reader.read(scope.session, scope.tenant)).toHaveProperty(
      'input',
    )
    const { observer } = await submit(f)
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: {
        adoptedEnvironment: { placement: { permission: 'always-allow' } },
        state: { terminal: { outcome: 'completed', result: 'actual-output' } },
      },
    })
    expect(executor).toHaveBeenCalledOnce()
    expect(p.acquired).toEqual(['call'])
    expect(p.entered).toEqual(['call'])
    expect(seen).toEqual(['actual-output'])
    await expect.poll(() => p.release.mock.calls.length).toBe(1)
    observer.release()
  } finally {
    await f.close()
  }
})

test('withdrawing and replacing the placement contributor cannot rebind an already adopted execution', async () => {
  const p = controlledProvider(),
    entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  const executor = vi.fn<ToolExecutor>(async (_args, dependencies) => {
    const command = dependencies.environment!.command!,
      request = {
        executable: 'controlled',
        args: [],
        cwd: '/controlled',
        env: {},
      }
    const original = await command.start(request)
    if (original.kind !== 'started') throw new Error('Original process missing')
    entered.resolve()
    await proceed.promise
    expect(await command.start(request)).toEqual({ kind: 'rejected', reason: 'closed' })
    const output: string[] = []
    for await (const chunk of original.process.output)
      output.push(new TextDecoder().decode(chunk.data))
    expect(await original.process.stop('forced')).toBe('confirmed')
    await original.process.result
    return output.join('')
  })
  const f = await actionIntegrationFixture({
    executor,
    environment: { tool: environmentTool, providers: [p.provider] },
  })
  try {
    const { observer } = await submit(f)
    await entered.promise
    const original = f.current.assembly.fibers.find(
      fiber => fiber.runtime?.name === toolEnvironmentPlacement.name,
    )
    if (!original) throw new Error('Original placement contributor missing')
    await original.dispose()
    const replacement = f.current.assembly.ctx.plugin(toolEnvironmentPlacement, {
      name: 'environment-fixture',
      factoryPermission: 'always-allow',
      selection: { kind: 'unique' },
    })
    await replacement
    proceed.resolve()
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: {
        state: { terminal: { outcome: 'completed', result: 'actual-output' } },
      },
    })
    expect(p.acquired).toEqual(['call'])
    expect(p.entered).toEqual(['call'])
    await expect.poll(() => p.release.mock.calls.length, { timeout: 10_000 }).toBe(1)
    observer.release()
    await replacement.dispose()
  } finally {
    proceed.resolve()
    for (const result of p.finished.values()) result.resolve(completed)
    await f.close()
  }
})

test('closing the actual runtime first closes new effects, drains the original author and records physical cleanup', async () => {
  const p = controlledProvider(),
    entered = Promise.withResolvers<void>()
  const executor = vi.fn<ToolExecutor>(async (_args, dependencies) => {
    const command = dependencies.environment!.command!,
      request = {
        executable: 'controlled',
        args: [],
        cwd: '/controlled',
        env: {},
      }
    const original = await command.start(request)
    if (original.kind !== 'started') throw new Error('Original process missing')
    entered.resolve()
    if (!dependencies.signal.aborted)
      await new Promise<void>(resolve =>
        dependencies.signal.addEventListener('abort', () => resolve(), { once: true }),
      )
    expect(await command.start(request)).toEqual({ kind: 'rejected', reason: 'closed' })
    expect(await original.process.stop('forced')).toBe('confirmed')
    await original.process.result
    return 'late-close-return'
  })
  const f = await actionIntegrationFixture({
    executor,
    environment: { tool: environmentTool, providers: [p.provider] },
  })
  try {
    const { observer } = await submit(f)
    await entered.promise
    const runtime = f.current.assembly.fibers.find(
      fiber => fiber.runtime?.name === 'tool-execution-local',
    )
    if (!runtime) throw new Error('Original runtime missing')
    await runtime.dispose()
    expect(await observer.read()).toMatchObject({ kind: 'rejected', reason: 'ownerStopped' })
    const projected = projectToolJournal(scope, (await f.f.prefix()).entries)
    if ('invalid' in projected) throw new Error('Original history invalid')
    expect(projected.executions.get('call')?.terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
    expect(
      projected.executions.get('call')?.resources.get('process/call')?.observations.at(-1)?.value
        .status,
    ).toBe('confirmed')
    expect(p.release).toHaveBeenCalledOnce()
    expect(p.acquired).toEqual(['call'])
    expect(p.entered).toEqual(['call'])
    expect(executor).toHaveBeenCalledOnce()
    observer.release()
  } finally {
    for (const result of p.finished.values()) result.resolve(completed)
    await f.close()
  }
})

test('multiple calls retain independent original leases; the second call finishes while the first still waits', async () => {
  const p = controlledProvider(),
    entered: string[] = []
  const executor = vi.fn<ToolExecutor>(async (args, dependencies) => {
    if (
      typeof args !== 'object' ||
      args === null ||
      !('call' in args) ||
      typeof args.call !== 'string'
    )
      throw new Error('Call marker missing')
    const call = args.call
    const started = await dependencies.environment?.command?.start({
      executable: 'controlled',
      args: [],
      cwd: '/controlled',
      env: {},
    })
    if (!started || started.kind !== 'started') throw new Error('Command missing')
    entered.push(call)
    if (call === 'second') p.finished.get(call)!.resolve(completed)
    await started.process.result
    return call
  })
  const f = await actionIntegrationFixture({
    calls: ['first', 'second'].map(call => {
      const captured = toolCall(call)
      if (captured.unparseable) throw new Error('Parseable fixture call required')
      return { ...captured, arguments: { call } }
    }),
    executor,
    environment: { tool: environmentTool, providers: [p.provider] },
  })
  try {
    const first = await submit(f),
      second = await submit(f, 1)
    try {
      await expect.poll(() => entered.length, { timeout: 20_000 }).toBe(2)
    } catch (cause) {
      throw new Error(
        JSON.stringify({
          acquired: p.acquired,
          authorCalls: executor.mock.calls.length,
          first: await first.observer.read(),
          second: await second.observer.read(),
        }),
        { cause },
      )
    }
    expect(await second.observer.waitForEnd()).toMatchObject({
      snapshot: { state: { terminal: { outcome: 'completed', result: 'second' } } },
    })
    expect(await first.observer.read()).toMatchObject({ snapshot: { state: { phase: 'running' } } })
    expect(p.acquired).toEqual(['first', 'second'])
    p.finished.get('first')!.resolve(completed)
    expect(await first.observer.waitForEnd()).toMatchObject({
      snapshot: { state: { terminal: { outcome: 'completed', result: 'first' } } },
    })
    expect(executor).toHaveBeenCalledTimes(2)
    await expect.poll(() => p.release.mock.calls.length).toBe(2)
    first.observer.release()
    second.observer.release()
  } finally {
    for (const result of p.finished.values()) result.resolve(completed)
    await f.close()
  }
})

test('original instance invalidation ends its execution without acquiring a successor and retains original cleanup', async () => {
  const p = controlledProvider(),
    entered = Promise.withResolvers<void>()
  const executor = vi.fn<ToolExecutor>(async (_args, dependencies) => {
    const original = await dependencies.environment!.command!.start({
      executable: 'controlled',
      args: [],
      cwd: '/controlled',
      env: {},
    })
    if (original.kind !== 'started') throw new Error('Original command missing')
    entered.resolve()
    if (!dependencies.signal.aborted)
      await new Promise<void>(resolve =>
        dependencies.signal.addEventListener('abort', () => resolve(), { once: true }),
      )
    expect(
      await dependencies.environment!.command!.start({
        executable: 'successor',
        args: [],
        cwd: '/controlled',
        env: {},
      }),
    ).toEqual({ kind: 'rejected', reason: 'closed' })
    expect(await original.process.stop('forced')).toBe('confirmed')
    await original.process.result
    return 'late-author-return'
  })
  const f = await actionIntegrationFixture({
    executor,
    environment: { tool: environmentTool, providers: [p.provider] },
  })
  try {
    const { observer } = await submit(f)
    await entered.promise
    p.invalidated.resolve({ reason: 'original-instance-ended' })
    expect(await observer.waitForEnd()).toMatchObject({
      snapshot: {
        state: {
          terminal: { outcome: 'unavailable', reason: 'environment:original-instance-ended' },
        },
      },
    })
    await expect.poll(() => p.release.mock.calls.length, { timeout: 10_000 }).toBe(1)
    expect(p.acquired).toEqual(['call'])
    expect(p.entered).toEqual(['call'])
    expect(executor).toHaveBeenCalledOnce()
    const projected = projectToolJournal(scope, (await f.f.prefix()).entries)
    if ('invalid' in projected) throw new Error('Original journal invalid')
    expect(
      projected.executions.get('call')?.resources.get('process/call')?.observations.at(-1)?.value
        .status,
    ).toBe('confirmed')
    observer.release()
  } finally {
    p.invalidated.resolve({ reason: 'fixture-close' })
    for (const result of p.finished.values()) result.resolve(completed)
    await f.close()
  }
})

test.each(['SQL permission', 'current access'] as const)(
  '%s revocation rejects new host effects while the original process retains output, result and stop',
  async revoked => {
    const p = controlledProvider(),
      started = Promise.withResolvers<void>(),
      proceed = Promise.withResolvers<void>(),
      checked = Promise.withResolvers<void>()
    const executor = vi.fn<ToolExecutor>(async (_args, dependencies) => {
      const command = dependencies.environment!.command!,
        request = {
          executable: 'controlled',
          args: [],
          cwd: '/controlled',
          env: {},
        }
      const original = await command.start(request)
      if (original.kind !== 'started') throw new Error('Original process missing')
      started.resolve()
      await proceed.promise
      try {
        expect(await command.start(request)).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
        const output: string[] = []
        for await (const chunk of original.process.output)
          output.push(new TextDecoder().decode(chunk.data))
        expect(await original.process.stop('graceful')).toBe('confirmed')
        expect(await original.process.result).toEqual(completed)
        return output.join('')
      } finally {
        f.current.restore()
        checked.resolve()
      }
    })
    const f = await actionIntegrationFixture({
      executor,
      environment: { tool: environmentTool, providers: [p.provider] },
    })
    try {
      const { observer } = await submit(f)
      await started.promise
      if (revoked === 'SQL permission') await f.environmentInputs!.permission('never-allow')
      else f.current.revoke()
      proceed.resolve()
      await checked.promise
      expect(await observer.waitForEnd()).toMatchObject({
        snapshot: {
          adoptedEnvironment: { placement: { permission: 'always-allow' } },
          state: { terminal: { outcome: 'completed', result: 'actual-output' } },
        },
      })
      expect(p.acquired).toEqual(['call'])
      expect(p.entered).toEqual(['call'])
      await expect.poll(() => p.release.mock.calls.length).toBe(1)
      observer.release()
    } finally {
      proceed.resolve()
      f.current.restore()
      for (const result of p.finished.values()) result.resolve(completed)
      await f.close()
    }
  },
)
