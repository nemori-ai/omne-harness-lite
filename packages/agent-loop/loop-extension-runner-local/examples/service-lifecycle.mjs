import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { loopExtensionRunnerPlugin } from '@omne-harness-lite/loop-extension-runner'

const dir = await mkdtemp(join(tmpdir(), 'omne-runner-example-'))
const log = await openJsonlSessionLog({
  dir,
  processOwnership: {
    current: `example-${process.pid}`,
    observeExit: async () => 'unknown',
  },
})
const ctx = new Context()
const provider = await ctx.plugin({
  name: 'example-log',
  apply(inner) {
    inner.provide('sessionLog', log)
  },
})
const runner = await ctx.plugin(loopExtensionRunnerPlugin, {
  host: () => ({
    // A real application supplies authorization, manifest/history sources and its shared task owner.
    acquireDispatch: async () => ({ failure: 'unavailable' }),
    acquireReplay: async () => ({ failure: 'unavailable' }),
  }),
})
try {
  const service = ctx.get('loopExtensionRunner')
  console.log(
    await service.replay({
      manifest: 'session',
      anchor: 'message',
      position: 'before_persist_message',
      subject: {
        producer: 'user',
        message: { id: 'message', type: 'user', blocks: [], createdAt: '2026-09-29T00:00:00Z' },
      },
    }),
  )
  console.log('registration:', typeof ctx.get('loopExtensionImplementations').registerBuiltin)
} finally {
  await runner.dispose()
  await provider.dispose()
  await log.close()
  await rm(dir, { recursive: true, force: true })
}
