import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SnapshotWorkspace } from '../src/maintenance/workspace.ts'
import { assertProductionStoragePath, ISOLATION_MARKER } from '../src/sqlite/protection.ts'
import { promises as fs } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const roots: string[] = []
const workspaces: SnapshotWorkspace[] = []
async function root() {
  const result = await realpath(await mkdtemp(join(tmpdir(), 'omne-workspace-test-')))
  roots.push(result)
  return result
}
afterEach(async () => {
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  for (const workspace of workspaces.splice(0)) await workspace.close()
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true })
})

describe('D055 permanent snapshot protection', () => {
  it('cleanup retains the durable ancestor, including when removed data reappears', async () => {
    const path = join(await root(), '.quarantine')
    const workspace = await SnapshotWorkspace.open(path)
    workspaces.push(workspace)
    const task = await workspace.createTask()
    await writeFile(join(task, 'data.sqlite'), 'synthetic plaintext')
    await workspace.removeTask(task)
    expect(await readFile(join(path, ISOLATION_MARKER), 'utf8')).toBe('omne-isolated/1\n')
    // Inject deletion rollback; this is not a physical power-loss experiment.
    await mkdir(task)
    const restored = join(task, 'data.sqlite')
    await writeFile(restored, 'synthetic plaintext')
    expect(() => assertProductionStoragePath(restored)).toThrow('isolated maintenance data')
    await workspace.close()
    await expect(workspace.createTask()).rejects.toMatchObject({ kind: 'unavailable' })
    expect(await readFile(join(path, ISOLATION_MARKER), 'utf8')).toBe('omne-isolated/1\n')
  })

  it('a second owner is busy until actual lock release; a new owner can then reuse protection', async () => {
    const path = join(await root(), '.quarantine')
    const first = await SnapshotWorkspace.open(path)
    workspaces.push(first)
    await expect(SnapshotWorkspace.open(path)).rejects.toMatchObject({ kind: 'busy' })
    await first.close()
    const second = await SnapshotWorkspace.open(path)
    workspaces.push(second)
    expect(await readFile(join(path, ISOLATION_MARKER), 'utf8')).toBe('omne-isolated/1\n')
  })

  it('a directory without protection is never retroactively treated as a safe workspace', async () => {
    const path = join(await root(), '.quarantine')
    await mkdir(path, { mode: 0o700 })
    await writeFile(join(path, 'residue.sqlite'), 'unprotected existing bytes')
    await expect(SnapshotWorkspace.open(path)).rejects.toMatchObject({ kind: 'unavailable' })
    expect(await readdir(path)).not.toContain(ISOLATION_MARKER)
    expect(await readFile(join(path, 'residue.sqlite'), 'utf8')).toBe('unprotected existing bytes')
  })

  it('failed parent synchronization returns no workspace or plaintext task', async () => {
    const parent = await root()
    const path = join(parent, '.quarantine')
    const original = fs.open
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await original(...args)
      if (String(args[0]) === parent)
        vi.spyOn(handle, 'sync').mockRejectedValue(
          Object.assign(new Error('injected parent sync failure'), { code: 'EIO' }),
        )
      return handle
    })
    syncBuiltinESMExports()
    await expect(SnapshotWorkspace.open(path)).rejects.toMatchObject({ kind: 'unavailable' })
    expect((await readdir(path)).some(name => name.startsWith('task-'))).toBe(false)
    vi.restoreAllMocks()
    syncBuiltinESMExports()
    const retry = await SnapshotWorkspace.open(path)
    workspaces.push(retry)
  })
})

it('does not relabel an acquisition defect or erase it behind a closed-handle cleanup failure', async () => {
  const parent = await root(),
    path = join(parent, '.quarantine')
  const defect = new Error('synthetic programming defect')
  const original = fs.open
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await original(...args)
    if (String(args[0]) === join(path, '.omne-isolated')) {
      vi.spyOn(handle, 'sync').mockRejectedValue(defect)
      const close = handle.close.bind(handle)
      vi.spyOn(handle, 'close').mockImplementation(async () => {
        await close()
        throw Object.assign(new Error('closed with IO error'), { code: 'EIO' })
      })
    }
    return handle
  })
  syncBuiltinESMExports()
  const failure: unknown = await SnapshotWorkspace.open(path).then(
    () => undefined,
    error => error,
  )
  expect(failure).toBeInstanceOf(AggregateError)
  const contains = (value: unknown): boolean =>
    value === defect ||
    (value instanceof AggregateError && value.errors.some(contains)) ||
    (value instanceof Error && value.cause !== undefined && contains(value.cause))
  expect(contains(failure)).toBe(true)
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  const reopened = await SnapshotWorkspace.open(path)
  workspaces.push(reopened)
})
