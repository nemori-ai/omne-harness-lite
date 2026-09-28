import { createHash } from 'node:crypto'
import { readFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { createAcceptanceApplication } from '@omne-harness-lite/model-invocation-minimal-demo'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'

const values = JSON.parse(await readFile(process.argv[2], 'utf8'))
const config = {
  ...values,
  wait: { ...values.wait, monotonicNow: () => performance.now(), sleep },
  sessionLog: {
    ...values.sessionLog,
    processOwnership: {
      current: 'log-close-child',
      async observeExit() {
        return 'unknown'
      },
    },
  },
}
const events = []
let log
const app = createAcceptanceApplication(config, {
  stage: 'sessionLog',
  diagnostics: {
    record(event) {
      events.push(event)
    },
  },
  hooks: {
    async fiberCreated(name, fiber) {
      if (name === 'sessionLog') {
        await fiber
        log = fiber.ctx.get('sessionLog')
      }
    },
  },
})
await app.ready
if ((await app.register('close-account', 'close-password-123')) !== 'registered')
  throw new Error('registration failed')
const actor = await app.authenticate('close-account', 'close-password-123')
if (!('account' in actor)) throw new Error('authentication failed')
await app.prepareSession(actor, 'close-session')
await log.append(
  'close-session',
  [{ tenant: actor.tenant, readKeys: ['close-test'], payload: { retained: true } }],
  { kind: 'unfenced' },
  { kind: 'unconditional' },
)
const original = await app.readSessionLog(actor, 'close-session')
const sessionDirectory = join(
  config.sessionLog.dir,
  createHash('sha256').update('close-session').digest('hex'),
)
await chmod(sessionDirectory, 0o000)
const closed = await app.close()
let retainedLock = false
try {
  const competitor = await openJsonlSessionLog(config.sessionLog)
  await competitor.close()
} catch {
  retainedLock = true
}
await chmod(sessionDirectory, 0o700)
process.stdout.write(
  JSON.stringify({ closed, retainedLock, actor, original, status: app.status(), events }) + '\n',
)
// This process deliberately retains an incomplete owner; process exit ends the test boundary.
