import { AsyncSqliteDatabase } from '../../src/sqlite/async-database.ts'
import { createUpgradeGuard, openStorage } from '../../src/index.ts'
import { openStorageWithHooks } from '../../src/open.ts'
import { migrationsOf } from './migrations.ts'

const [file, workDirectory, stage, mode] = process.argv.slice(2)
if (file === undefined || workDirectory === undefined) throw new Error('missing fixture paths')
if (stage === 'snapshot') {
  const guard = createUpgradeGuard()
  const previous = await openStorage({
    dialect: 'sqlite',
    file,
    migrations: migrationsOf('data'),
    upgrade: { guard, checks: [] },
  })
  await guard.confirm()
  await previous.close()
}
const snapshotSources = new WeakSet<AsyncSqliteDatabase>()
const backup = AsyncSqliteDatabase.prototype.backup
AsyncSqliteDatabase.prototype.backup = async function (...args): Promise<void> {
  snapshotSources.add(this)
  await backup.apply(this, args)
}
const exec = AsyncSqliteDatabase.prototype.exec
const close = AsyncSqliteDatabase.prototype.close
let failedHandle: WeakRef<AsyncSqliteDatabase> | undefined
async function isSource(db: AsyncSqliteDatabase): Promise<boolean> {
  return (await db.all('PRAGMA database_list')).some(
    row => row.name === 'main' && row.file === file,
  )
}
AsyncSqliteDatabase.prototype.exec = async function (sql: string): Promise<void> {
  if (stage === 'initialize' && sql.startsWith('PRAGMA synchronous') && (await isSource(this)))
    throw new Error('injected initialization failure')
  await exec.call(this, sql)
}
AsyncSqliteDatabase.prototype.close = async function (): Promise<void> {
  if (stage === 'snapshot' ? snapshotSources.has(this) : await isSource(this)) {
    failedHandle = new WeakRef(this)
    throw new Error('injected source close failure')
  }
  await close.call(this)
}
let failed = false
try {
  await openStorageWithHooks(
    {
      dialect: 'sqlite',
      file,
      migrations: stage === 'snapshot' ? migrationsOf('data', 't1') : migrationsOf('data'),
      upgrade: { guard: createUpgradeGuard(), checks: [] },
      ...(mode === 'plain' ? {} : { maintenance: { workDirectory, onClosed() {} } }),
    },
    {},
    {
      beforePreflight() {
        if (stage === 'preflight') throw new Error('injected preflight failure')
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
