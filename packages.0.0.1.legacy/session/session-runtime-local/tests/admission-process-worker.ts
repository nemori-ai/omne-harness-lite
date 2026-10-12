import { openStorage } from '@omne-harness-lite/storage-sql'
import { createLocalAdmission } from '../src/index.ts'
import {
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
const file = process.argv[2]
if (!file) throw new Error('missing root storage')
const centerId = 'a'.repeat(32)
if (!isGovernanceCenterId(centerId)) throw new Error('invalid fixture')
const source = {
  centerId,
  accountId: unwrap(parseAccountId('owner')),
  loginStateHandle: unwrap(parseLoginStateId('login-1')),
}
const target = {
  tenant: unwrap(parseTenantId({ organization: 'team-a', account: 'owner' })),
  session: 'session-a',
  purpose: 'startRun' as const,
  operationKey: 'start-1',
  inputPosition: '1',
}
const storage = await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
const owner = await createLocalAdmission(
  storage,
  {
    verify: async () => {
      // The owned transport has obtained rejection. Deliberately stop before returning it to settlement.
      process.send?.({ kind: 'received-rejection' })
      return new Promise<never>(() => {})
    },
  },
  { maxLogins: 8, maxTickets: 16, maxRecordBytes: 4096 },
)
const original = await owner.reserve(source, target)
process.send?.({ kind: 'reserved', ticket: original.ticket })
await owner.query(original.ticket)
