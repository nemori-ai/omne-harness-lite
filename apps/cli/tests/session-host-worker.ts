/** Transport lifecycle fixture: real root/tenant SQLite and ingress; member probe and Context completion are controlled. */
import { join } from 'node:path'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  parseTenantId,
  parseAccountId,
  parseLoginStateId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import {
  openSqlSessionLog,
  sessionLogMigrations,
  type SqlSessionLog,
} from '@omne-harness-lite/session-log-sql'
import {
  createLocalAdmission,
  createLocalSessionIngress,
  admissionMigrations,
  admissionUseMigrations,
  sessionStateMigrations,
  operationReceiptMigrations,
  sessionRuntimeMigrations,
} from '@omne-harness-lite/session-runtime-local'
import { createSessionHostEndpoint } from '../dist/session-host-protocol.js'
import { startLocalSessionHost } from '../dist/session-host-server.js'
const home = process.env.OMNE_TEST_HOST_HOME
if (!home) throw new Error('missing fixture home')
const tenant = unwrap(parseTenantId({ organization: 'team', account: 'owner' }))
const centerId = 'a'.repeat(32)
if (!isGovernanceCenterId(centerId)) throw new Error('invalid fixture center')
const source = {
  centerId,
  accountId: unwrap(parseAccountId('owner')),
  loginStateHandle: unwrap(parseLoginStateId('original-login')),
}
const root = await openStorage({
  dialect: 'sqlite',
  file: join(home, 'root.sqlite'),
  synchronous: 'full',
})
const storage = await openStorage({
  dialect: 'sqlite',
  file: join(home, 'tenant.sqlite'),
  synchronous: 'full',
})
for (const migration of admissionMigrations) await root.write(tx => migration.migration.up(tx.db))
for (const migration of [
  ...admissionUseMigrations,
  ...sessionStateMigrations,
  ...operationReceiptMigrations,
  ...sessionRuntimeMigrations,
  ...sessionLogMigrations,
])
  await storage.write(tx => migration.migration.up(tx.db))
const admission = await createLocalAdmission(
  root,
  {
    verify: async (_source, target) =>
      target.purpose === 'createSession'
        ? { kind: 'memberValid', role: 'member' }
        : { kind: 'valid' },
  },
  { maxLogins: 8, maxTickets: 32, maxRecordBytes: 16384 },
)
const gate = Promise.withResolvers<void>()
let log!: SqlSessionLog
const ingress = createLocalSessionIngress({
  storage,
  admission,
  source,
  tenant,
  principal: source.accountId,
  policy: {
    maxSessions: 16,
    maxRecordBytes: 16384,
    maxInFlight: 8,
    maxSteps: 32,
    state: { maxPendingPerSession: 8, maxBatchSize: 8, maxRecordBytes: 16384 },
    receipts: { maxRecords: 32, maxRecordBytes: 16384 },
  },
  log: authority => {
    log = openSqlSessionLog({ storage, authority, operationLimit: 32 })
    return log.participant
  },
  bootstrap: {
    initialize: async scope => {
      process.send?.({ kind: 'initializing', session: scope.session })
      await gate.promise
      return 'ready'
    },
  },
  now: () => new Date().toISOString(),
  workSettledIn: async () => 'settled',
})
const endpoint = createSessionHostEndpoint({
  binding: { formatVersion: 1, centerId, tenant },
  ingress,
})
const host = await startLocalSessionHost({
  home,
  binding: { formatVersion: 1, centerId, tenant },
  endpoint,
  policy: {
    maxRequestBytes: 16384,
    maxResponseBytes: 32768,
    maxConnections: 8,
    maxInFlight: 4,
    requestTimeoutMs: 10000,
    headersTimeoutMs: 5000,
    idleTimeoutMs: 5000,
    checkIntervalMs: 100,
    maxFailureRecords: 8,
    maxHeaderBytes: 8192,
  },
  diagnostic: error => {
    process.send?.({ kind: 'defect', name: error instanceof Error ? error.name : 'non-error' })
  },
})
process.on('message', message => {
  if (message === 'release') gate.resolve()
  if (message === 'close')
    void close().catch(error => {
      console.error(error)
      process.exitCode = 1
      process.disconnect()
    })
})
async function close() {
  await host.close()
  await ingress.close()
  await log.close()
  await admission.close()
  await storage.close()
  await root.close()
  process.send?.({ kind: 'closed' }, () => process.disconnect())
}
process.send?.({ kind: 'ready' })
