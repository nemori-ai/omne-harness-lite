import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import { createAcceptanceApplication } from '@omne-harness-lite/model-invocation-minimal-demo'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { installSqlControlFault } from './sql-control-fault.ts'
const rawPrepare = DatabaseSync.prototype.prepare
const values = JSON.parse(await readFile(process.argv[2], 'utf8'))
const config = { ...values, wait: { ...values.wait, monotonicNow: () => performance.now(), sleep } }
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
const fault = installSqlControlFault(config.databaseFile, 'lostReceipt', 'model_call_ended')
fault.arm()
const append = await log.append(
  'close-session',
  [
    {
      tenant: actor.tenant,
      readKeys: ['close-test'],
      payload: { retained: true, kind: 'model_call_ended' },
    },
  ],
  { kind: 'unfenced' },
  { kind: 'unconditional' },
)
if (append.failure !== 'unavailable') throw new Error('SQL unknown boundary missed')
const db = new DatabaseSync(config.databaseFile, { readOnly: true })
const rows = rawPrepare
  .call(
    db,
    "select position, value from sl_entry where session = 'close-session' order by position_length, position",
  )
  .all()
db.close()
const original = {
  entries: rows.map(row => ({
    ...JSON.parse(row.value),
    session: 'close-session',
    position: Number(row.position),
  })),
  tail: Number(rows.at(-1)?.position ?? 0),
}
const closed = await app.close()
let retainedLock = false
const competitor = createAcceptanceApplication(config, {
  stage: 'sessionLog',
  diagnostics: { record() {} },
})
try {
  await competitor.ready
} catch {
  retainedLock = true
}
await competitor.close()
process.stdout.write(
  JSON.stringify({ closed, retainedLock, actor, original, status: app.status(), events }) + '\n',
)
// The original owner is deliberately retained through failed close; actual process exit ends this fixture.
