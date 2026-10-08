import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { implementationRegistry } from '@omne-harness-lite/tool-execution-local/cordis'
import { createShellTool } from '../src/index.ts'
import { shell } from '../src/cordis.ts'
import { fixture } from './fixture.ts'

test.each([
  {},
  {
    contextKey: 'workspace.shell',
    backgroundThreshold: 'PT30S',
    executePermission: 'auto' as const,
  },
  { executePermission: 'forbid' as const },
])(
  'registration preserves adopted configuration and withdraws without revoking a closure (%j)',
  async overrides => {
    const ctx = new Context()
    const owner = ctx.plugin(implementationRegistry, {})
    const config = {
      asset: 'actual-shell',
      version: 'version-1.0.0',
      shell: { executable: '/bin/bash', args: ['--noprofile', '--norc'] },
      maxOutputBytes: 1024,
      ...overrides,
    }
    await owner
    const service = ctx.toolImplementations
    const binding = ctx.plugin(shell, config)
    try {
      await binding
      const selected = {
        capability: capabilityCanonicalString({ category: 'tool', name: 'Shell' }),
        asset: config.asset,
        version: config.version,
        definition: createShellTool(config).definition,
        adoption: 'observed-adoption',
      }
      const sentinel = {
        ...selected,
        asset: 'unrelated',
        executor: createShellTool(config).executor,
      }
      const removeSentinel = service.register(sentinel)
      const original = service.acquire(selected)
      expect(original).toHaveProperty('implementation')
      if (!('implementation' in original)) throw new Error('Expected acquired implementation')
      await binding.dispose()
      expect(service.acquire(selected)).toEqual({ kind: 'unavailable' })
      expect(ctx.toolImplementations.acquire(sentinel)).toHaveProperty('implementation')
      removeSentinel()
      const input = fixture()
      const result = await original.implementation.executor(
        { command: 'execute', args: { command: 'printf actual' } },
        input.deps,
      )
      expect(typeof result).not.toBe('string')
      expect(input.command.start).toHaveBeenCalledOnce()
      expect(input.deps.context.read).toHaveBeenCalledWith([config.contextKey ?? 'shell.initial'])
      original.release()
    } finally {
      await binding.dispose()
      await owner.dispose()
    }
  },
)
