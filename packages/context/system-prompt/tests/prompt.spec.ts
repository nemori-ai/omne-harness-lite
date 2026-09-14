// Selectively ported from DSH system-prompt tests; omissions are documented in tools-source.md.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { createScope } from '@omne-harness-lite/scope/baseline'
import type { Scope } from '@omne-harness-lite/scope/baseline'
import SystemPrompt, {
  TOOL_ORDER_REST,
  parseSystemPromptConfig,
  renderContextSections,
  renderContextSnapshot,
  renderPrompt,
} from '../dist/index.js'

describe('source prompt assembly baseline', () => {
  it('validates source configuration and rejects ambiguous tool order', () => {
    expect(parseSystemPromptConfig({})).toMatchObject({
      includeRuntimeContext: true,
    })
    expect(() => parseSystemPromptConfig({ toolOrder: ['echo'] }))
      .toThrow(`toolOrder must contain the "${TOOL_ORDER_REST}" rest entry`)
    expect(() => parseSystemPromptConfig({ toolOrder: [TOOL_ORDER_REST, TOOL_ORDER_REST] }))
      .toThrow(`toolOrder lists "${TOOL_ORDER_REST}" more than once`)
  })

  it('assembles ordered dynamic contributions and strictly renders variables', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(SystemPrompt, {
      personaPrefix: 'Agent {{name}}',
      personaSuffix: '',
    })
    try {
      let name = 'one'
      ctx.systemPrompt.variable('name', () => name)
      ctx.systemPrompt.section({ name: 'z', order: 10, text: 'last' })
      ctx.systemPrompt.section({ name: 'a', order: 10, text: () => 'first' })
      ctx.systemPrompt.context({ name: 'runtime', order: 1, text: 'cwd {{cwd}}' })
      ctx.systemPrompt.variable('cwd', () => '/work')
      const parameters = { type: 'object', properties: { text: { type: 'string' } } }
      ctx.systemPrompt.tools(() => ({ schemas: [{ name: 'echo', description: 'echo', parameters }] }))

      const first = await ctx.systemPrompt.assemble()
      expect(first.sections.map(section => section.name)).toEqual([
        'deployment:persona-prefix', 'a', 'z', 'deployment:persona-suffix',
      ])
      expect(renderPrompt(first)).toBe('Agent one\n\nfirst\n\nlast')
      expect(renderContextSections(first)).toEqual([{ name: 'runtime', text: 'cwd /work' }])
      expect(renderContextSnapshot(first)).toContain('cwd /work')
      expect(first.tools[0]?.parameters).not.toBe(parameters)
      name = 'two'
      expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('Agent two')
    } finally {
      await fiber.dispose()
    }
  })

  it('applies scope shadows and withdraws them when their owner is disposed', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(SystemPrompt)
    const key = {}
    let scope: Scope | undefined
    const minter = await ctx.plugin(Object.assign((inner: Context) => {
      scope = createScope(inner, key)
    }, { inject: ['systemPrompt'] }))
    if (scope === undefined) throw new Error('scope minter did not run')
    try {
      ctx.systemPrompt.section({ name: 'persona', order: 1, text: 'global' })
      scope.ctx.systemPrompt.section({ name: 'persona', order: 1, text: 'scoped' })
      expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).toContain('scoped')
      expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).not.toContain('global')
      await scope.dispose()
      expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).toContain('global')
    } finally {
      await scope.dispose()
      await minter.dispose()
      await fiber.dispose()
    }
  })

  it('keeps a complete section authoritative after cooperative assembly', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(SystemPrompt)
    try {
      ctx.systemPrompt.section({ name: 'complete', order: 1, text: 'fixed {{value}}', complete: true })
      ctx.systemPrompt.variable('value', () => 'prompt')
      ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
        assembly.sections.push({ name: 'late', text: 'late' })
        return next()
      })
      const assembly = await ctx.systemPrompt.assemble()
      expect(assembly.sections).toEqual([{ name: 'complete', text: 'fixed {{value}}' }])
      expect(renderPrompt(assembly)).toBe('fixed prompt')
      expect(() => renderPrompt({ ...assembly, variables: {} }))
        .toThrow('unknown prompt variable "{{value}}"')
    } finally {
      await fiber.dispose()
    }
  })

  it('orders known tools and inserts unlisted tools at the explicit rest slot', async () => {
    const ctx = new Context()
    const fiber = await ctx.plugin(SystemPrompt, {
      toolOrder: ['second', TOOL_ORDER_REST, 'first'],
    })
    try {
      ctx.systemPrompt.tools(() => ({
        schemas: ['third', 'first', 'second'].map(name => ({ name, description: name, parameters: {} })),
      }))
      expect((await ctx.systemPrompt.assemble()).tools.map(tool => tool.name))
        .toEqual(['second', 'third', 'first'])
    } finally {
      await fiber.dispose()
    }
  })
})
