import { DatabaseSync } from 'node:sqlite'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { createUpgradeGuard, openStorage } from '../../src/index.ts'
import { migrationsOf } from './migrations.ts'

const file = process.argv[2]
const workDirectory = process.argv[3]
if (file === undefined || workDirectory === undefined) throw new Error('missing fixture paths')
const external = process.argv[4] === 'file'
const guard = createUpgradeGuard()
let observed: string = 'pending'
const storage = await openStorage({
  dialect: 'sqlite',
  file,
  migrations: migrationsOf('data'),
  upgrade: { guard, checks: [] },
  maintenance: {
    workDirectory,
    onClosed: value => {
      observed = value
    },
  },
})
await guard.confirm()
const maintenance = storage.maintenance
if (maintenance === undefined) throw new Error('missing maintenance')
const close = DatabaseSync.prototype.close
let failedHandle: DatabaseSync | undefined
DatabaseSync.prototype.close = function (this: DatabaseSync): void {
  const path = this.prepare('PRAGMA database_list')
    .all()
    .find(row => row.name === 'main')?.file
  if (!external && typeof path === 'string' && path.endsWith('/snapshot.sqlite')) {
    failedHandle = this
    throw new Error('injected snapshot handle close failure')
  }
  close.call(this)
}
let externalFile: Awaited<ReturnType<typeof open>> | undefined
let operationFailed = false
try {
  await maintenance.run(async session => {
    if (!external) return session.snapshot(async () => true)
    externalFile = await open(join(workDirectory, 'external-output'), 'wx', 0o600)
    const fileHandle = externalFile
    session.ownResource(
      async () => {
        throw new Error('injected file close failure')
      },
      () => fileHandle.fd < 0,
    )
    return true
  })
} catch {
  operationFailed = true
}
let closeFailed = false
try {
  await storage.close()
} catch {
  closeFailed = true
}
let refusesNew = false
try {
  await maintenance.run(async () => true)
} catch {
  refusesNew = true
}
process.stdout.write(
  JSON.stringify({
    operationFailed,
    closeFailed,
    refusesNew,
    observed,
    handleStillOpen: external
      ? externalFile !== undefined && externalFile.fd >= 0
      : failedHandle?.isOpen === true,
  }) + '\n',
)
// Stay alive to prove both locks remain owned. Only the fixture parent requests exit.
process.stdin.resume()
process.stdin.once('data', () => process.exit(1))
