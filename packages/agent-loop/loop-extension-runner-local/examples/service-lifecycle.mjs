import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { loopExtensionRunnerPlugin } from '@omne-harness-lite/loop-extension-runner-local/cordis'
import { RunnerHostService } from '@omne-harness-lite/loop-extension-runner/cordis'
import { SessionLogService } from '@omne-harness-lite/session-log/cordis'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'

const dir = await mkdtemp(join(tmpdir(), 'omne-runner-example-'))
const log = await openJsonlSessionLog({
  dir,
  processOwnership: {
    current: `example-${process.pid}`,
    observeExit: async () => 'unknown',
  },
})
const ctx = new Context()
class Log extends SessionLogService {
  append(...args) {
    return log.append(...args)
  }
  readByKey(...args) {
    return log.readByKey(...args)
  }
  readSince(...args) {
    return log.readSince(...args)
  }
}
class Host extends RunnerHostService {
  // The example explicitly has no authorized dispatch or replay scope.
  async acquireDispatch() {
    return { failure: 'unavailable' }
  }
  async acquireReplay() {
    return { failure: 'unavailable' }
  }
}
class Access extends SessionAccessService {
  // This example has no authenticated action caller.
  async authorize() {
    return { kind: 'rejected', reason: 'notAuthorized' }
  }
}
const provider = await ctx.plugin({
  name: 'example-log',
  apply(inner) {
    new Log(inner)
    new Host(inner)
    new Access(inner)
  },
})
const runner = await ctx.plugin(loopExtensionRunnerPlugin, {})
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
