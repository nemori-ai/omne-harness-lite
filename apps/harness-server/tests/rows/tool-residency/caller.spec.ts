import { Context, Service } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'

it('carries each wrapped intercept through the real Service caller projection', async () => {
  const root = new Context()
  class Configured extends Service<{ caller: string; limit?: number }> {
    constructor(ctx: Context) {
      super(ctx, 'configured')
    }
    read() {
      return this[Service.resolveConfig]()
    }
  }
  const provider = await root.plugin(Configured)
  const seen: unknown[] = []
  const row = defineRow({
    row: 'caller-proof',
    implementation: 'real',
    manifest: { provides: [], injects: ['configured', 'extra'], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      inject: { configured: { caller: 'maintainer', limit: 7 } },
      apply(ctx: Context) {
        seen.push(ctx.get('configured').read())
      },
    },
  })
  const fiber = root.plugin(row)
  expect(seen).toEqual([])
  root.provide('extra', {})
  await fiber
  expect(seen).toEqual([{ caller: 'maintainer', limit: 7 }])
  expect(rowDeclarationOf(row)?.manifest.injects).toEqual(['configured', 'extra'])
  await fiber.dispose()
  await provider.dispose()
})
