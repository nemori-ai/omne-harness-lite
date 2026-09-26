import { DatabaseSync } from 'node:sqlite'
import { createUpgradeGuard } from '../../src/index.ts'
import { openStorageWithHooks } from '../../src/open.ts'
import { migrationsOf } from './migrations.ts'

const [file, workDirectory, stage] = process.argv.slice(2)
if (file === undefined || workDirectory === undefined) throw new Error('missing fixture paths')
const exec = DatabaseSync.prototype.exec
const close = DatabaseSync.prototype.close
let failedHandle: WeakRef<DatabaseSync> | undefined
function isSource(db: DatabaseSync): boolean {
  return db
    .prepare('PRAGMA database_list')
    .all()
    .some(row => row.name === 'main' && row.file === file)
}
DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string): void {
  if (stage === 'initialize' && sql.startsWith('PRAGMA synchronous') && isSource(this))
    throw new Error('injected initialization failure')
  exec.call(this, sql)
}
DatabaseSync.prototype.close = function (this: DatabaseSync): void {
  if (isSource(this)) {
    failedHandle = new WeakRef(this)
    throw new Error('injected source close failure')
  }
  close.call(this)
}
let failed = false
try {
  await openStorageWithHooks(
    {
      dialect: 'sqlite',
      file,
      migrations: migrationsOf('data'),
      upgrade: { guard: createUpgradeGuard(), checks: [] },
      maintenance: { workDirectory, onClosed() {} },
    },
    {},
    {
      beforePreflight() {
        throw new Error('injected preflight failure')
      },
    },
  )
} catch {
  failed = true
}
// Leave the creating turn and force GC; failed startup returned no SqlStorage owner.
await new Promise<void>(resolve => setImmediate(resolve))
globalThis.gc?.()
process.stdout.write(
  JSON.stringify({ failed, handleStillOpen: failedHandle?.deref()?.isOpen === true }) + '\n',
)
process.stdin.resume()
process.stdin.once('data', () => process.exit(1))
