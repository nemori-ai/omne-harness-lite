// Native-only source flow derived from DSH tools tests; PTC/approval/host paths are intentionally absent.
import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@omne-harness-lite/agent/scope-baseline'
import type { Scope } from '@omne-harness-lite/agent/scope-baseline'
import { describe, expect, it } from 'vitest'
import { ToolCallId } from '../dist/llm/index.js'
import ToolRuntime, { defineTool } from '../dist/tools/index.js'

function echo(label: string) {
  return defineTool({
    name: 'echo',
    description: label,
    parameters: { text: { type: 'string', required: true } },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string', required: true } }, additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.text }],
      presentationMeta: (_args, value) => ({ length: value.text.length }),
    },
    async execute({ text }) {
      return { text: `${label}:${text}` }
    },
  })
}

describe('source native tool registry baseline', () => {
  it('registers, shadows, restricts, and withdraws scoped definitions', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ToolRuntime)
    const key = {}
    let scope: Scope | undefined
    const minter = await ctx.plugin(Object.assign((inner: Context) => {
      scope = createScope(inner, key)
    }, { inject: ['tools'] }))
    if (scope === undefined) throw new Error('scope minter did not run')
    try {
      ctx.tools.register(echo('global'))
      expect(ctx.tools.schemas().map(tool => tool.description)).toEqual(['global'])
      scope.ctx.tools.restrict({ deny: ['echo'] })
      expect(ctx.tools.schemas(key)).toEqual([])
      scope.ctx.tools.register(echo('scoped'))
      expect(ctx.tools.schemas(key).map(tool => tool.description)).toEqual(['scoped'])
      await scope.dispose()
      expect(ctx.tools.schemas(key).map(tool => tool.description)).toEqual(['global'])
    } finally {
      await scope.dispose()
      await minter.dispose()
      await fiber.dispose()
    }
  })

  it('detaches definitions and returns frozen canonical native results', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ToolRuntime)
    try {
      const definition = echo('ok')
      ctx.tools.register(definition)
      const authoredParameters = definition.parameters as {
        properties: { text: { type: string } }
      }
      expect(() => { authoredParameters.properties.text.type = 'number' }).toThrow(TypeError)
      const result = await ctx.tools.execute({
        callId: ToolCallId('call-1'),
        name: 'echo',
        arguments: { text: 'hello' },
        signal: new AbortController().signal,
      })
      expect(result).toMatchObject({
        isError: false,
        value: { text: 'ok:hello' },
        content: [{ type: 'text', text: 'ok:hello' }],
        meta: { length: 8 },
      })
      expect(Object.isFrozen(result)).toBe(true)
      if (!result.isError) expect(Object.isFrozen(result.value)).toBe(true)
    } finally {
      await fiber.dispose()
    }
  })

  it.each([
    ['missing', 'UNKNOWN_TOOL'],
    ['invalid-args', 'INVALID_ARGS'],
    ['lossy-args', 'UNKNOWN'],
    ['invalid-output', 'INVALID_TOOL_OUTPUT'],
    ['body-error', 'UNKNOWN'],
    ['render-error', 'INVALID_TOOL_OUTPUT'],
  ] as const)('reports %s without manufacturing a successful value', async (scenario, code) => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ToolRuntime)
    try {
      const defined = echo('base')
      const base = { ...defined, output: { ...defined.output } }
      if (scenario === 'invalid-output') base.execute = async () => ({ wrong: true })
      if (scenario === 'body-error') base.execute = async () => { throw new Error('body failed') }
      if (scenario === 'render-error') base.output.render = () => { throw new Error('render failed') }
      if (scenario !== 'missing') ctx.tools.register(base)
      const result = await ctx.tools.execute({
        callId: ToolCallId(`call-${scenario}`),
        name: scenario === 'missing' ? 'missing' : 'echo',
        arguments: scenario === 'invalid-args'
          ? {}
          : scenario === 'lossy-args'
            ? { text: undefined }
            : { text: 'x' },
        signal: new AbortController().signal,
      })
      expect(result.isError).toBe(true)
      if (result.isError) expect(result.error.info?.code).toBe(code)
      expect('value' in result).toBe(false)
    } finally {
      await fiber.dispose()
    }
  })

  it('does not invoke the body when the caller is already aborted', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ToolRuntime)
    let called = false
    try {
      const source = echo('never')
      const definition = {
        ...source,
        execute: async () => { called = true; return { text: 'never' } },
      }
      ctx.tools.register(definition)
      const controller = new AbortController()
      controller.abort(new Error('cancelled'))
      const result = await ctx.tools.execute({
        callId: ToolCallId('aborted'), name: 'echo', arguments: { text: 'x' }, signal: controller.signal,
      })
      expect(result).toMatchObject({ isError: true, error: { info: { code: 'ABORTED_BEFORE_DISPATCH' } } })
      expect(called).toBe(false)
    } finally {
      await fiber.dispose()
    }
  })

  it('applies a captured final content transform once to a normalized failure', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ToolRuntime)
    let calls = 0
    try {
      const source = echo('bounded')
      ctx.tools.register({
        ...source,
        async execute() { throw new Error('body failed') },
        finalizeContent(exec, result) {
          calls += 1
          expect(exec.name).toBe('echo')
          expect(Object.isFrozen(result)).toBe(true)
          expect(result.isError).toBe(true)
          return [{ type: 'text', text: 'bounded failure' }]
        },
      })
      const result = await ctx.tools.execute({
        callId: ToolCallId('finalized'), name: 'echo', arguments: { text: 'x' }, signal: new AbortController().signal,
      })
      expect(result).toMatchObject({
        isError: true,
        content: [{ type: 'text', text: 'bounded failure' }],
      })
      expect(calls).toBe(1)
    } finally {
      await fiber.dispose()
    }
  })

  it('normalizes a throwing final content transform without invoking it again', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(ToolRuntime)
    let calls = 0
    try {
      ctx.tools.register({
        ...echo('finalizer'),
        finalizeContent() {
          calls += 1
          throw new Error('finalizer failed')
        },
      })
      const result = await ctx.tools.execute({
        callId: ToolCallId('throwing-finalizer'),
        name: 'echo',
        arguments: { text: 'x' },
        signal: new AbortController().signal,
      })
      expect(result).toMatchObject({
        isError: true,
        error: { message: 'finalizer failed', info: { code: 'UNKNOWN' } },
      })
      expect(calls).toBe(1)
    } finally {
      await fiber.dispose()
    }
  })
})
