import { openStorage } from '@omne-harness-lite/storage-sql'
import { openSqlSessionLog } from '@omne-harness-lite/session-log-sql'

const [file, session, tenantJson] = process.argv.slice(2)
if (!file || !session || !tenantJson || !process.send)
  throw new Error('invalid partial write fixture')
const storage = await openStorage({ dialect: 'sqlite', file, synchronous: 'full', upgrade: false })
const access = Object.freeze({})
const authority = {
  storage,
  async authorize(unit, candidate) {
    unit.assertStorage(storage)
    return { kind: candidate === access ? 'authorized' : 'denied' }
  },
  async authorizeEnumeration() {
    return { kind: 'denied' }
  },
}
const log = openSqlSessionLog({ storage, authority, operationLimit: 8 })
setInterval(() => {}, 1000)
// The parent waits for staging, kills this actual writer, and observes exit before reopening.
await storage.atomic(async unit => {
  const result = await log.participant.appendIn(unit, access, {
    session,
    entries: [{ tenant: JSON.parse(tenantJson), readKeys: [], payload: { oc1FirstCommit: true } }],
    fence: { kind: 'unfenced' },
    condition: { kind: 'unconditional' },
  })
  if (result.kind !== 'staged') throw new Error('original SQL batch was not staged')
  process.send('partial-written')
  await new Promise(() => {})
})
throw new Error('uncommitted writer unexpectedly completed')
