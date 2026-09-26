import { DatabaseSync } from 'node:sqlite'
import { composeMigrations } from '@omne-harness-lite/storage'
import { existsSync, promises as fs } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { join, dirname } from 'node:path'
import { once } from 'node:events'
import { createUpgradeGuard, openSnapshotInspection, openStorage } from '../../src/index.ts'

const [mode, resource, behavior, source, root] = process.argv.slice(2)
if (source === undefined || root === undefined) throw new Error('missing paths')
const marker = join(root, '.omne-isolated')
const original = fs.open
let observed: WeakRef<Awaited<ReturnType<typeof fs.open>>> | undefined
let attempts = 0
let native: WeakRef<DatabaseSync> | undefined
const nativeClose = DatabaseSync.prototype.close
const nativeExec = DatabaseSync.prototype.exec
const isCoordination = (db: DatabaseSync) =>
  db.prepare('PRAGMA database_list').get()?.file === join(root, '.owner-lock')
if (resource?.startsWith('coordination')) {
  DatabaseSync.prototype.close = function () {
    if (!isCoordination(this)) return nativeClose.call(this)
    native = new WeakRef(this)
    attempts++
    if (behavior !== 'return-open')
      throw Object.assign(new Error('injected coordination close failure'), { code: 'EIO' })
  }
  DatabaseSync.prototype.exec = function (sql: string) {
    if (
      isCoordination(this) &&
      resource === 'coordination-pragma' &&
      sql === 'PRAGMA journal_mode = MEMORY'
    )
      throw new Error('injected coordination initialization failure')
    const result = nativeExec.call(this, sql)
    if (isCoordination(this) && resource === 'coordination-begin' && sql === 'BEGIN IMMEDIATE')
      throw new Error('injected failure after actual BEGIN')
    return result
  }
}
fs.open = async (...args) => {
  if (resource === 'coordination-release' && String(args[0]) === marker)
    throw Object.assign(new Error('injected marker open failure'), { code: 'EIO' })
  const handle = await original(...args)
  const path = String(args[0])
  const match =
    resource === 'marker'
      ? path === marker
      : resource === 'root'
        ? path === root
        : path === dirname(root) && existsSync(marker)
  if (match && !resource?.startsWith('coordination')) {
    observed = new WeakRef(handle)
    const close = handle.close.bind(handle)
    handle.close = async () => {
      attempts++
      if (behavior === 'throw-closed') await close()
      if (behavior !== 'return-open')
        throw Object.assign(new Error('injected acquisition close failure'), { code: 'EIO' })
    }
  }
  return handle
}
syncBuiltinESMExports()
let failure: unknown
try {
  if (mode === 'online') {
    const storage = await openStorage({
      dialect: 'sqlite',
      file: source,
      migrations: composeMigrations([]),
      upgrade: { guard: createUpgradeGuard(), checks: [] },
      maintenance: { workDirectory: root, onClosed() {} },
    })
    await storage.close()
  } else {
    const inspection = await openSnapshotInspection(root)
    await inspection.close()
  }
} catch (error) {
  failure = error
}
fs.open = original
DatabaseSync.prototype.close = nativeClose
DatabaseSync.prototype.exec = nativeExec
syncBuiltinESMExports()
for (let i = 0; i < 3; i++) {
  await new Promise<void>(resolve => setImmediate(resolve))
  global.gc?.()
}
const exit = once(process.stdin, 'data')
process.stdout.write(
  JSON.stringify({
    stage: 'failed',
    failed: failure !== undefined,
    attempts,
    resourceOpen: (observed?.deref()?.fd ?? -1) >= 0 || native?.deref()?.isOpen === true,
  }) + '\n',
)
await exit
process.exit(1)
