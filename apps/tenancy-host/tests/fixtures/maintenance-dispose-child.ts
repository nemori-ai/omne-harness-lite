import { promises as fs, realpathSync } from 'node:fs'
import { once } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { boot, ENV } from '../../src/index.ts'
import { StorageCompletion } from '@omne-harness-lite/storage/cordis'
import { EntryMaintenance } from '@omne-harness-lite/governance-center-entry/cordis'
import type { EntryMaintenanceResources } from '@omne-harness-lite/governance-center-entry'
import type { Context } from '@deepseek-ai/cordis'
import { resolveProvider } from '../support/tree.ts'
import { callOps } from '../../src/maintenance-command.ts'

const fault = process.argv[2]
class PendingStorageCompletion extends StorageCompletion {
  constructor(ctx: Context) {
    super(ctx)
  }
  closed = () => {}
}
class PendingMaintenance extends EntryMaintenance {
  readonly snapshotChecks: EntryMaintenanceResources['snapshotChecks']
  constructor(ctx: Context, actual: EntryMaintenanceResources) {
    super(ctx)
    this.snapshotChecks = actual.snapshotChecks
  }
  closed = () => {}
}
const host = await boot({
  hooks: {
    resolveModule: async reference => {
      const module = await resolveProvider(reference)
      const selected =
        (fault === 'controller-pending' &&
          reference.export === 'managedGovernanceCenterOpsPlugin') ||
        (fault === 'storage-pending' && reference.export === 'managedStorageSqlPlugin')
      if (!selected) return module
      if (typeof module !== 'object' || module === null) throw new Error('missing fixture module')
      const plugin: unknown = Reflect.get(module, reference.export)
      if (typeof plugin !== 'object' || plugin === null) throw new Error('missing fixture plugin')
      const apply: unknown = Reflect.get(plugin, 'apply')
      if (typeof apply !== 'function') throw new Error('missing fixture apply')
      return {
        ...module,
        [reference.export]: {
          ...plugin,
          apply(ctx: Context, config: unknown) {
            const key = fault === 'controller-pending' ? 'entryMaintenance' : 'storageCompletion'
            const scoped = ctx.isolate(key)
            if (fault === 'controller-pending') {
              const actual = ctx.get('entryMaintenance')
              if (actual === undefined) throw new Error('missing maintenance resource')
              new PendingMaintenance(scoped, actual)
            } else {
              const supplied = scoped.plugin(inner => {
                new PendingStorageCompletion(inner)
              })
              return supplied.then(() => apply(scoped, config))
            }
            return apply(scoped, config)
          },
        },
      }
    },
  },
})
const initial = once(process.stdin, 'data')
process.stdout.write(JSON.stringify({ stage: 'ready' }) + '\n')
await initial
if (fault === 'controller-error') {
  const unlink = fs.unlink
  fs.unlink = async path => {
    if (String(path).includes('/export-'))
      throw Object.assign(new Error('injected cleanup IO failure'), { code: 'EIO' })
    await unlink(path)
  }
  syncBuiltinESMExports()
  const socketDirectory = process.env[ENV.opsSocketDirectory]
  if (socketDirectory === undefined) throw new Error('missing test socket')
  const result = await callOps(
    { kind: 'ops', socketDirectory, operation: 'backup', onlyIfDue: false },
    new AbortController().signal,
  )
  if (
    typeof result !== 'object' ||
    result === null ||
    !('status' in result) ||
    result.status !== 'unavailable'
  )
    throw new Error('cleanup fault did not reach the operation')
}
if (fault === 'storage-error') {
  const source = process.env[ENV.storageFile]
  if (source === undefined) throw new Error('missing test source')
  const canonical = realpathSync(source)
  const close = DatabaseSync.prototype.close
  DatabaseSync.prototype.close = function (this: DatabaseSync): void {
    const path = this.prepare('PRAGMA database_list')
      .all()
      .find(row => row.name === 'main')?.file
    if (typeof path === 'string' && path.length > 0 && realpathSync(path) === canonical)
      throw new Error('injected native source close failure')
    close.call(this)
  }
}
const result = await host.dispose()
const exit = once(process.stdin, 'data')
process.stdout.write(JSON.stringify({ stage: 'disposed', result }) + '\n')
await exit
process.exit(result.complete ? 0 : 1)
