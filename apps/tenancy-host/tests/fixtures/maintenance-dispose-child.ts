import { promises as fs, realpathSync } from 'node:fs'
import { once } from 'node:events'
import { syncBuiltinESMExports } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { boot, ENV } from '../../src/index.ts'
import { callOps } from '../../src/maintenance-command.ts'

const fault = process.argv[2]
const host = await boot({
  hooks: {
    manifest: entries =>
      entries.map(entry => {
        if (
          (fault === 'controller-pending' && entry.name === 'governance-center-ops') ||
          (fault === 'storage-pending' && entry.name === 'storage-sql')
        ) {
          const config = entry.config as { maintenance: Record<string, unknown> }
          return {
            ...entry,
            config: { ...config, maintenance: { ...config.maintenance, onClosed() {} } },
          }
        }
        return entry
      }),
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
