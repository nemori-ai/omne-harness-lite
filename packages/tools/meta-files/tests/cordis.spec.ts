import sharp from 'sharp'
import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { createSharpImageCodec } from '@omne-harness-lite/image-codec'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { implementationRegistry } from '@omne-harness-lite/tool-execution-local/cordis'
import { createFilesTool } from '../src/index.ts'
import { files } from '../src/cordis.ts'
import { options, fixture, text } from './fixture.ts'
test.each(['ask', 'auto', 'forbid'] as const)(
  'Cordis registers data-only policy, withdraws discovery and preserves borrowed executor (%s)',
  async permission => {
    const ctx = new Context(),
      owner = ctx.plugin(implementationRegistry, {})
    await owner
    const config = {
      ...options,
      asset: 'files-asset',
      version: 'v1',
      executePermission: permission,
    }
    const binding = ctx.plugin(files, config)
    try {
      await binding
      const selected = {
        capability: capabilityCanonicalString({ category: 'tool', name: 'Files' }),
        asset: config.asset,
        version: config.version,
        definition: createFilesTool(config, { imageCodec: createSharpImageCodec(sharp) })
          .definition,
        adoption: 'original',
      }
      const original = ctx.toolImplementations.acquire(selected)
      if (!('implementation' in original)) throw new Error('not acquired')
      await binding.dispose()
      expect(ctx.toolImplementations.acquire(selected)).toEqual({ kind: 'unavailable' })
      const h = fixture()
      h.seed('a', 'body')
      expect(
        text(
          await original.implementation.executor({ command: 'read', args: { path: 'a' } }, h.deps),
        ),
      ).toContain('body')
      original.release()
    } finally {
      await binding.dispose()
      await owner.dispose()
    }
  },
)
