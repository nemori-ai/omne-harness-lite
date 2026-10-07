import { join } from 'node:path'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { composeMigrations, type Storage } from '@omne-harness-lite/storage'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { parseTenantId, parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import { createRuntimeContext, runtimeContextMigrations } from '../../dist/index.js'

const [dir, cut] = process.argv.slice(2)
if (!dir || !['after-log', 'inside-sql'].includes(cut!))
  throw new Error('invalid crash fixture inputs')
const scope = {
  tenant: unwrap(parseTenantId({ organization: 'org', account: 'alice' })),
  session: unwrap(parseOpaqueIdentifier('crash-session', 'SessionRef')),
}
const log = await openJsonlSessionLog({
  dir: join(dir, 'logs'),
  processOwnership: { current: `crash:${process.pid}`, observeExit: async () => 'unknown' },
})
const physical = await openStorage({
  dialect: 'sqlite',
  file: join(dir, 'context.sqlite'),
  migrations: composeMigrations(runtimeContextMigrations),
  upgrade: false,
})
let armed = false
async function stopHere() {
  process.send?.({ kind: 'cut', pid: process.pid })
  await new Promise<void>(() => {})
}
const storage: Storage = {
  read: fn => physical.read(fn),
  write: fn =>
    physical.write(async tx => {
      const result = await fn(tx)
      if (armed && cut === 'inside-sql') await stopHere()
      return result
    }),
}
const access = Object.freeze({}) as SessionAccess
const owner = createRuntimeContext({
  storage,
  log: {
    ...log,
    append: async (...args) => {
      const result = await log.append(...args)
      if (armed && cut === 'after-log') await stopHere()
      return result
    },
  },
  access: {
    authorize: async () => ({
      kind: 'authorized',
      identity: {
        scope,
        binding: 'crash',
        principal: 'fixture',
        principalKind: 'system',
        consumer: 'coordinator',
        contextKeys: ['public'],
      },
    }),
  },
  now: () => '2026-10-04T00:00:00Z',
})
const current = await owner.operations.registrations(access, scope)
if (current.kind !== 'registrations') throw new Error('crash fixture seed absent')
owner.sources.registerSource({
  name: 'session',
  recovery: 'persisted',
  consumers: ['tool'],
  requiredKeys: [],
  read: async () => ({ kind: 'values', values: [] }),
})
armed = true
const result = await owner.operations.register(
  access,
  scope,
  {
    key: 'public',
    source: 'session',
    config: null,
    consumers: ['tool'],
    required: false,
    recovery: 'persisted',
  },
  current.revision,
)
throw new Error(`crash cutpoint missed: ${result.kind}`)
