import { setTimeout as wait } from 'node:timers/promises'
import { startLocalSessionHost } from '../dist/session-host-server.js'
import { checkedTenantBinding } from '../dist/state-layout-values.js'

const home = process.argv[2]
if (!home) throw new Error('missing test home')
if (process.argv[3] === 'exit') process.exit(7)
await wait(process.argv[3] === 'delayed' ? 200 : 0)
const host = await startLocalSessionHost({
  home,
  binding: checkedTenantBinding({
    formatVersion: 1,
    centerId: 'a'.repeat(32),
    tenant: { organization: 'team', account: 'owner' },
  }),
  endpoint: { execute: async () => ({ kind: 'creationNotReady' }) },
  policy: {
    maxRequestBytes: 65536,
    maxResponseBytes: 65536,
    maxConnections: 8,
    maxInFlight: 4,
    requestTimeoutMs: 1000,
    headersTimeoutMs: 1000,
    idleTimeoutMs: 1000,
    checkIntervalMs: 100,
    maxFailureRecords: 8,
    maxHeaderBytes: 8192,
  },
  diagnostic(error) {
    throw error
  },
})
process.send?.({ kind: 'ready' })
await new Promise<void>(resolve => process.once('SIGTERM', resolve))
await host.close()
process.disconnect?.()
