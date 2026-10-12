import { constants } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { lstat, mkdir, open, realpath, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { SnapshotFailure, StorageDefect } from '@omne-harness-lite/storage'
import {
  acquireSqliteLock,
  SqliteLockBusy,
  SqliteLockIncomplete,
  type SqliteOwnerLock,
} from '../sqlite/lock.ts'
import { ISOLATION_CONTENT, ISOLATION_MARKER } from '../sqlite/protection.ts'
import type { OwnerLock } from '../upgrade/owner.ts'
import { physicalFailure, withCleanup } from './failure.ts'
import { SnapshotResources } from './resources.ts'

/** Acquisition never yielded an engine, but its handles and coordination lock remain owned. */
export class WorkspaceAcquisitionIncomplete extends StorageDefect {
  constructor(cause: unknown) {
    super('maintenance workspace initialization resources remain owned', { cause })
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

async function privateDirectory(path: string): Promise<void> {
  const info = await lstat(path)
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0 ||
    process.getuid === undefined ||
    info.uid !== process.getuid()
  )
    throw new SnapshotFailure('unavailable')
}

/** No method removes the permanent root or its marker. */
export class SnapshotWorkspace {
  #closed = false
  private constructor(
    readonly root: string,
    private readonly lock: OwnerLock,
  ) {}

  static async open(path: string): Promise<SnapshotWorkspace> {
    try {
      return await SnapshotWorkspace.acquire(path)
    } catch (error) {
      throw physicalFailure(error)
    }
  }

  private static async acquire(path: string): Promise<SnapshotWorkspace> {
    const { root, parent, created } = await prepareWorkspaceRoot(path)
    let lock: SqliteOwnerLock
    try {
      lock = await acquireSqliteLock(join(root, '.owner-lock'))
    } catch (error) {
      if (error instanceof SqliteLockIncomplete) throw new WorkspaceAcquisitionIncomplete(error)
      if (error instanceof SqliteLockBusy) throw new SnapshotFailure('busy')
      throw error
    }
    const resources = new SnapshotResources()
    try {
      await withCleanup(
        () => initializeWorkspace(root, parent, created, resources),
        async () => {
          try {
            await resources.close()
          } finally {
            resources.assertClean()
          }
        },
      )
      return new SnapshotWorkspace(root, lock)
    } catch (error) {
      // SnapshotResources and the SQLite lock primitive retain their native resources.
      // The online source owner must also retain its lock when acquisition never returns.
      if (!resources.settled) throw new WorkspaceAcquisitionIncomplete(error)
      try {
        return await withCleanup(
          async () => {
            throw error
          },
          () => lock.release(),
        )
      } catch (settledFailure) {
        if (!lock.released) throw new WorkspaceAcquisitionIncomplete(settledFailure)
        throw settledFailure
      }
    }
  }

  async createTask(): Promise<string> {
    if (this.#closed) throw new SnapshotFailure('unavailable')
    const path = join(this.root, `task-${randomBytes(16).toString('hex')}`)
    await mkdir(path, { mode: 0o700 })
    return path
  }

  async removeTask(path: string): Promise<void> {
    if (dirname(path) !== this.root || !path.startsWith(join(this.root, 'task-')))
      throw new SnapshotFailure('unavailable')
    try {
      await rm(path, { recursive: true, force: false })
    } catch (error) {
      throw new SnapshotFailure('unavailable', { cause: error, residual: path })
    }
  }

  async close(): Promise<void> {
    this.#closed = true
    await this.lock.release()
  }
}

async function prepareWorkspaceRoot(path: string) {
  if (!isAbsolute(path)) throw new SnapshotFailure('unavailable')
  const parent = await realpath(dirname(resolve(path)))
  await privateDirectory(parent)
  const root = join(parent, basename(resolve(path)))
  if (root === parent) throw new SnapshotFailure('unavailable')
  let created = false
  try {
    await mkdir(root, { mode: 0o700 })
    created = true
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error
  }
  await privateDirectory(root)
  return { root, parent, created }
}

async function initializeWorkspace(
  root: string,
  parent: string,
  created: boolean,
  resources: SnapshotResources,
) {
  const syncDirectory = async (directory: string) => {
    const handle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    const close = resources.own(
      () => handle.close(),
      () => handle.fd < 0,
    )
    await withCleanup(() => handle.sync(), close)
  }
  const marker = await open(
    join(root, ISOLATION_MARKER),
    constants.O_NOFOLLOW |
      (created ? constants.O_RDWR | constants.O_CREAT | constants.O_EXCL : constants.O_RDWR),
    0o600,
  )
  const close = resources.own(
    () => marker.close(),
    () => marker.fd < 0,
  )
  await withCleanup(async () => {
    const info = await marker.stat()
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
      throw new SnapshotFailure('unavailable')
    if (created) await marker.writeFile(ISOLATION_CONTENT)
    else if (
      info.size !== Buffer.byteLength(ISOLATION_CONTENT) ||
      (await marker.readFile('utf8')) !== ISOLATION_CONTENT
    )
      throw new SnapshotFailure('unavailable')
    await marker.sync()
  }, close)
  await syncDirectory(root)
  await syncDirectory(parent)
}
