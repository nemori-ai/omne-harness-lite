import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { hostEnvironmentMigrations } from '../src/migrations.ts'

export async function hostStorageFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'omne-host-tests-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'host.sqlite'),
    migrations: composeMigrations(hostEnvironmentMigrations),
    upgrade: false,
  })
  return {
    storage,
    directory,
    async close() {
      await storage.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}
