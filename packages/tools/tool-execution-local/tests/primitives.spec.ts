import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createParameterJudge, isToolDefinition, judgeToolReturn, toolResultOf, type ToolDefinition } from '@omne-harness-lite/tool-definition'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import type { InvocationDependencies, ToolImplementation, ToolRuntimeOperations } from '@omne-harness-lite/tool-execution-runtime'
import { TOOL_IMPLEMENTATIONS, TOOL_RUNTIME_REGISTRY } from '@omne-harness-lite/tool-execution-runtime/cordis'
import { createToolInvoker, createToolImplementationRegistry, createToolRuntimeRegistry } from '../src/index.ts'
import { implementationRegistry, runtimeRegistry } from '../src/cordis.ts'

function definition(): ToolDefinition {
  const value = { name: 'echo', description: 'Return input text.', paradigm: 'single', input: { type: 'object', properties: { text: { type: 'string', description: 'Text to return.' } }, required: ['text'] }, permissions: { execute: { default: 'auto' } }, origin: { kind: 'authored' } }
  if (!isToolDefinition(value)) throw new Error('fixture definition rejected')
  return value
}
function dependencies(): InvocationDependencies {
  return {
    context: { async read() { return { kind: 'values', values: [] } } },
    signal: new AbortController().signal,
    async wait() { return { kind: 'rejected', reason: 'notAllowed' } },
    frames: { emit() { return { kind: 'accepted' } } },
    costs: { async report() { return 'recorded' } },
  }
}
function invoker() {
  const id = parseOpaqueIdentifier('returned', 'BlockId')
  if (!('ok' in id)) throw new Error('fixture block')
  return createToolInvoker({ parameters: createParameterJudge(), judgeResult(value) {
    return 'rejected' in judgeToolReturn(value) ? { kind: 'invalid' } : { kind: 'valid', result: typeof value === 'string' ? value : toolResultOf(value, id.ok) }
  } })
}
const missing: ToolRuntimeOperations = {
  async submit() { return { kind: 'rejected', reason: 'runtimeNotReady' } },
  async acquire() { return { kind: 'rejected', reason: 'runtimeNotReady' } },
  async stop() { return 'unavailable' }, async answer() { return 'unavailable' },
}
function implementation(): ToolImplementation {
  return { capability: 'echo', asset: 'echo-asset', version: '1', definition: definition(), executor: async () => 'original' }
}

describe('standalone invocation and implementation ownership', () => {
  it('validates before effects and owns argument data independently of the caller', async () => {
    const run = invoker(), input = { text: 'original' }
    const execute = vi.fn(async (args) => {
      expect(Object.isFrozen(args)).toBe(true)
      await Promise.resolve()
      return args.text
    })
    const result = run({ definition: definition(), args: input, executor: execute }, dependencies())
    input.text = 'changed'
    expect(await result).toEqual({ kind: 'returned', result: 'original' })
    expect(await run({ definition: definition(), args: { text: 1 }, executor: execute }, dependencies())).toEqual({ kind: 'failed', code: 'arguments_invalid' })
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('distinguishes errors from strings and rejects non-JSON returns', async () => {
    const run = invoker(), def = definition(), deps = dependencies()
    expect(await run({ definition: def, args: { text: 'x' }, executor: async () => { throw new Error('private implementation detail') } }, deps)).toEqual({ kind: 'failed', code: 'implementation_error' })
    expect(await run({ definition: def, args: { text: 'x' }, executor: async () => ({ content: [], isError: true }) }, deps)).toEqual({ kind: 'returned', result: { content: [], isError: true } })
    expect(await run({ definition: def, args: { text: 'x' }, executor: async () => 'error: still ordinary text' }, deps)).toEqual({ kind: 'returned', result: 'error: still ordinary text' })
    const invalid = () => Promise.resolve(new Date())
    // The runtime boundary must validate even if an executor violates its static signature.
    expect(await run({ definition: def, args: { text: 'x' }, executor: invalid as unknown as ToolImplementation['executor'] }, deps)).toEqual({ kind: 'failed', code: 'result_rejected' })
  })
  it('preserves captured implementations across withdrawal and protects replacement generations', async () => {
    const registry = createToolImplementationRegistry(), value = implementation(), selected = { ...value, adoption: 'a' }
    const remove = registry.register(value)
    expect(() => registry.register(value)).toThrow('duplicate')
    const lease = registry.acquire(selected)
    if ('kind' in lease) throw new Error('fixture missing')
    remove()
    expect(registry.acquire(selected)).toEqual({ kind: 'unavailable' })
    registry.register({ ...value, executor: async () => 'replacement' })
    remove()
    expect(await lease.implementation.executor({}, dependencies())).toBe('original')
    const next = registry.acquire(selected)
    if ('kind' in next) throw new Error('replacement removed by stale disposer')
    expect(await next.implementation.executor({}, dependencies())).toBe('replacement')
    expect(registry.acquire({ ...selected, definition: { ...value.definition, description: 'different' } })).toEqual({ kind: 'definitionMismatch' })
  })
  it('requires explicit resource invalidation to invalidate a captured declaration', () => {
    const registry = createToolImplementationRegistry(), controller = new AbortController()
    const value = { ...implementation(), invalidated: controller.signal }
    registry.register(value)
    const selected = { ...value, adoption: 'a' }
    expect(registry.acquire(selected)).toHaveProperty('implementation')
    controller.abort()
    expect(registry.acquire(selected)).toEqual({ kind: 'unavailable' })
  })
  it('does not let old registry withdrawal remove a replacement', async () => {
    const registry = createToolRuntimeRegistry()
    const remove = registry.register(missing)
    expect(() => registry.register(missing)).toThrow('already registered')
    await remove()
    registry.register(missing)
    await remove()
    expect(() => registry.register(missing)).toThrow('already registered')
  })
})

it('Cordis assigns contribution withdrawal to the calling plugin without replacing stable services', async () => {
  const ctx = new Context()
  const implementations = ctx.plugin(implementationRegistry, {})
  const runtimes = ctx.plugin(runtimeRegistry, {})
  try {
    await implementations
    await runtimes
    const stable = ctx.toolImplementations
    const sentinel = { ...implementation(), capability: 'sentinel' }
    const removeSentinel = stable.register(sentinel)
    const value = implementation()
    const contributor = ctx.plugin({ inject: [TOOL_IMPLEMENTATIONS, TOOL_RUNTIME_REGISTRY], apply(c) {
      c.toolImplementations.register(value)
      c.toolRuntimeRegistry.register(missing)
    } })
    await contributor
    expect(ctx.toolImplementations.acquire({ ...value, adoption: 'a' })).toHaveProperty('implementation')
    await contributor.dispose()
    expect(ctx.toolImplementations.acquire({ ...sentinel, adoption: 'a' })).toHaveProperty('implementation')
    expect(stable.acquire({ ...sentinel, adoption: 'a' })).toHaveProperty('implementation')
    removeSentinel()
    expect(ctx.toolImplementations.acquire({ ...value, adoption: 'a' })).toEqual({ kind: 'unavailable' })
    const second = ctx.plugin({ inject: [TOOL_RUNTIME_REGISTRY], apply(c) { c.toolRuntimeRegistry.register(missing) } })
    await second
    await second.dispose()
  } finally { await runtimes.dispose(); await implementations.dispose() }
})
