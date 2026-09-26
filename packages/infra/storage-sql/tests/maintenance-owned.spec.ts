import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createUpgradeGuard,
  openStorage,
  openSnapshotInspection,
  type SqlStorage,
} from '../src/index.ts'
import { migrationsOf } from './fixtures/migrations.ts'

const roots: string[] = []
const owners: SqlStorage[] = []
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-owned-snapshot-')))
  roots.push(root)
  const file = join(root, 'center.sqlite')
  const work = join(root, '.quarantine')
  const guard = createUpgradeGuard()
  const onClosed = vi.fn()
  const storage = await openStorage({
    dialect: 'sqlite',
    file,
    synchronous: 'full',
    migrations: migrationsOf('data'),
    upgrade: { guard, checks: [] },
    maintenance: { workDirectory: work, onClosed },
  })
  owners.push(storage)
  const maintenance = storage.maintenance
  if (maintenance === undefined) throw new Error('owned SQLite is missing maintenance')
  return { root, file, work, guard, storage, maintenance, onClosed }
}
afterEach(async () => {
  for (const storage of owners.splice(0)) await storage.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('D055 maintenance belongs to the original SqlStorage owner', () => {
  it('requires confirmed upgrade and retains offline exclusion for the owner lifetime', async () => {
    const { maintenance, guard, work } = await fixture()
    await expect(maintenance.run(async () => true)).rejects.toMatchObject({ kind: 'unavailable' })
    await guard.confirm()
    await maintenance.run(session =>
      session.snapshot(async view => {
        expect(await view.inspection.tx.db.selectFrom('data').selectAll().execute()).toEqual([
          { id: 'data-seed' },
        ])
      }),
    )
    await expect(openSnapshotInspection(work)).rejects.toMatchObject({ kind: 'busy' })
  })

  it('waits for the whole callback and keeps the source owner while normal writes can progress', async () => {
    const { maintenance, guard, storage, file, onClosed } = await fixture()
    await guard.confirm()
    let ready!: () => void
    let release!: () => void
    const entered = new Promise<void>(resolve => {
      ready = resolve
    })
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const running = maintenance.run(session =>
      session.snapshot(async () => {
        ready()
        await gate
        return 'real end'
      }),
    )
    await entered
    await expect(maintenance.run(async () => true)).rejects.toMatchObject({ kind: 'busy' })
    await storage.write(async tx => {
      await tx.db.insertInto('data').values({ id: 'during-backup' }).execute()
    })
    const ended = vi.fn()
    const closing = storage.close().then(ended)
    await Promise.resolve()
    expect(ended).not.toHaveBeenCalled()
    expect(onClosed).not.toHaveBeenCalled()
    await expect(
      openStorage({
        dialect: 'sqlite',
        file,
        migrations: migrationsOf('data'),
        upgrade: { guard: createUpgradeGuard(), checks: [] },
      }),
    ).rejects.toMatchObject({ stage: 'occupied' })
    release()
    await expect(running).resolves.toBe('real end')
    await closing
    expect(onClosed).toHaveBeenCalledExactlyOnceWith('clean')
    const nextGuard = createUpgradeGuard()
    const next = await openStorage({
      dialect: 'sqlite',
      file,
      migrations: migrationsOf('data'),
      upgrade: { guard: nextGuard, checks: [] },
    })
    owners.push(next)
    await nextGuard.confirm()
    expect(await next.read(tx => tx.db.selectFrom('data').selectAll().execute())).toHaveLength(2)
  })
})
