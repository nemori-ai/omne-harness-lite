import { acquireSqliteLock, SqliteLockBusy } from '../src/sqlite/lock.ts'
import { composeMigrations } from '@omne-harness-lite/storage'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createUpgradeGuard, openSnapshotInspection, openStorage } from '../src/index.ts'

const cases = [
  { mode: 'online', resource: 'coordination-release', behavior: 'throw-open' },
  { mode: 'offline', resource: 'coordination-release', behavior: 'return-open' },
  { mode: 'online', resource: 'coordination-begin', behavior: 'throw-open' },
  { mode: 'online', resource: 'coordination-pragma', behavior: 'throw-open' },
  { mode: 'online', resource: 'marker', behavior: 'throw-open' },
  { mode: 'online', resource: 'root', behavior: 'throw-open' },
  { mode: 'online', resource: 'parent', behavior: 'throw-open' },
  { mode: 'offline', resource: 'marker', behavior: 'throw-open' },
  { mode: 'offline', resource: 'root', behavior: 'return-open' },
  { mode: 'online', resource: 'marker', behavior: 'throw-closed' },
]
it.each(cases)(
  'retains initialization ownership: $mode $resource $behavior',
  async ({ mode, resource, behavior }) => {
    const parent = await realpath(await mkdtemp(join(tmpdir(), 'omne-workspace-close-')))
    const source = join(parent, 'source.sqlite'),
      root = join(parent, '.quarantine')
    const child = spawn(
      process.execPath,
      [
        '--expose-gc',
        '--experimental-transform-types',
        '--no-warnings',
        process.env.OMNE_TEST_WORKSPACE_CLOSE_FIXTURE ??
          fileURLToPath(
            new URL('./fixtures/maintenance-workspace-close-child.ts', import.meta.url),
          ),
        mode,
        resource,
        behavior,
        source,
        root,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', text => {
      stderr += String(text)
    })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('exit', resolve)
      child.once('error', reject)
    })
    const reader = createInterface({ input: child.stdout })
    const lines = reader[Symbol.asyncIterator]()
    const sourceProbe = async () => {
      try {
        const storage = await openStorage({
          dialect: 'sqlite',
          file: source,
          migrations: composeMigrations([]),
          upgrade: { guard: createUpgradeGuard(), checks: [] },
        })
        await storage.close()
        return 'opened'
      } catch (error) {
        return error instanceof Error && 'stage' in error ? error.stage : 'other'
      }
    }
    const workspaceProbe = async () => {
      if (resource.startsWith('coordination')) {
        try {
          const lock = acquireSqliteLock(join(root, '.owner-lock'))
          await lock.release()
          return 'opened'
        } catch (error) {
          return error instanceof SqliteLockBusy ? 'busy' : 'other'
        }
      }
      try {
        const inspection = await openSnapshotInspection(root)
        await inspection.close()
        return 'opened'
      } catch (error) {
        return error instanceof Error && 'kind' in error ? error.kind : 'other'
      }
    }
    try {
      const report: unknown = JSON.parse((await lines.next()).value ?? '{}')
      expect(report, stderr).toMatchObject({ stage: 'failed', failed: true })
      if (mode === 'online')
        expect(await sourceProbe()).toBe(behavior === 'throw-closed' ? 'opened' : 'occupied')
      expect(await workspaceProbe()).toBe(
        behavior === 'throw-closed' || resource === 'coordination-pragma' ? 'opened' : 'busy',
      )
      expect(report, stderr).toMatchObject({ resourceOpen: behavior !== 'throw-closed' })
      child.stdin.write('exit\n')
      expect(await exited).toBe(1)
      if (mode === 'online') expect(await sourceProbe()).toBe('opened')
      expect(await workspaceProbe()).toBe('opened')
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
      reader.close()
      await rm(parent, { recursive: true, force: true })
    }
  },
  20_000,
)
