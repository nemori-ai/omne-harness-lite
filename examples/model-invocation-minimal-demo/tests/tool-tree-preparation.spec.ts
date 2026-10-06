import { Context } from '@deepseek-ai/cordis'
import { expect, test, vi } from 'vitest'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'
import { installDemoTools } from '../src/tool-demo-assembly.ts'

test('rejects invalid actual tool-tree configuration before any plugin or startup input is applied', async () => {
  const ctx = new Context()
  const apply = vi.spyOn(ctx, 'plugin')
  try {
    await expect(
      installDemoTools({
        ctx,
        // No resource or authority is read: preparation must reject before constructing the startup input.
        recovery: {} as RecoveryAccess,
        directory: '/unused-invalid-tool-tree',
        config: {
          resultStorage: 'demo-results',
          frameQueueBytes: -1,
          tailRetry: { attempts: 3, minDelayMs: 10, maxDelayMs: 100 },
        },
        onStopping() {
          throw new Error('Invalid tree was started')
        },
      }),
    ).rejects.toMatchObject({ code: 'invalid-config', rowId: 'tool-execution' })
    expect(apply).not.toHaveBeenCalled()
  } finally {
    apply.mockRestore()
    await ctx.fiber.dispose()
  }
})
