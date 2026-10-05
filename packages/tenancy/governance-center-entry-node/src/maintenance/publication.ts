import { cleanupFailure, ownResourceAt } from './resources.ts'
import { constants } from 'node:fs'
import { link, lstat, open, unlink, type FileHandle } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { SnapshotFailure, type SnapshotInspectionSession } from '@omne-harness-lite/storage'
import {
  hasCode,
  MaintenanceFailure,
  maintenanceFailure,
  withCleanup,
  PublicationUnknown,
  type UnknownResult,
} from './failure.ts'

export function checkCancelled(session: SnapshotInspectionSession): void {
  if (session.cancelled) throw new SnapshotFailure('cancelled')
}

/** Directory identity stays attached to an owned descriptor through confirmation. */
export class MaintenanceDirectory {
  private constructor(
    readonly path: string,
    private readonly handle: FileHandle,
    private readonly dev: number,
    private readonly ino: number,
  ) {}

  static async use<T>(
    path: string,
    session: SnapshotInspectionSession,
    privateOnly: boolean,
    fn: (directory: MaintenanceDirectory) => Promise<T>,
  ): Promise<T> {
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    const close = ownResourceAt(
      session,
      () => handle.close(),
      () => handle.fd < 0,
      path,
    )
    return withCleanup(async () => {
      const info = await handle.stat()
      if (
        !info.isDirectory() ||
        (privateOnly && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))
      )
        throw new MaintenanceFailure('unavailable')
      const directory = new MaintenanceDirectory(path, handle, info.dev, info.ino)
      await directory.stable()
      return fn(directory)
    }, close)
  }

  async stable(): Promise<void> {
    const info = await lstat(this.path)
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.dev !== this.dev ||
      info.ino !== this.ino
    )
      throw new MaintenanceFailure('unavailable')
  }
  async confirm(): Promise<void> {
    await this.stable()
    await this.handle.sync()
    await this.stable()
  }
}

export interface MaintenanceDiagnostic {
  readonly event: 'maintenance-residual'
  readonly temporaryLocation: string
  readonly publishedLocation: string | null
}
export type MaintenanceReporter = (diagnostic: MaintenanceDiagnostic) => void

/** Temporary bytes are created only inside the run's already-protected work root. */
export async function withTemporaryOutput<T>(
  workRoot: string,
  session: SnapshotInspectionSession,
  report: MaintenanceReporter,
  fn: (output: {
    readonly path: string
    readonly handle: FileHandle
    markPublished(path: string): void
  }) => Promise<T>,
): Promise<T> {
  checkCancelled(session)
  const path = join(workRoot, `export-${randomBytes(16).toString('hex')}`)
  const handle = await open(path, 'wx', 0o600)
  const close = ownResourceAt(
    session,
    () => handle.close(),
    () => handle.fd < 0,
    path,
  )
  let publishedLocation: string | null = null
  return withCleanup(
    () =>
      fn({
        path,
        handle,
        markPublished(value) {
          publishedLocation = value
        },
      }),
    async () => {
      try {
        await withCleanup(close, async () => {
          // A failed close which still owns its handle leaves the isolated file in place.
          if (handle.fd >= 0) return
          await unlink(path)
        })
      } catch (error) {
        report({ event: 'maintenance-residual', temporaryLocation: path, publishedLocation })
        throw cleanupFailure(error, path)
      }
    },
  )
}

/** Publication is exclusive and never retried or undone by this function. */
export async function publishOutput(
  temporary: string,
  destination: string,
  directory: MaintenanceDirectory,
  session: SnapshotInspectionSession,
  unknown: UnknownResult,
  markPublished: (path: string) => void,
  confirmParent?: () => Promise<void>,
): Promise<void> {
  checkCancelled(session)
  await directory.stable()
  checkCancelled(session)
  try {
    await link(temporary, destination)
  } catch (error) {
    if (hasCode(error, 'EEXIST')) throw new MaintenanceFailure('target-exists', { cause: error })
    throw error
  }
  markPublished(destination)
  // Once visible, cancellation must not change the outcome to cancelled or delete it.
  try {
    await directory.confirm()
    await confirmParent?.()
  } catch (error) {
    if (!(maintenanceFailure(error) instanceof MaintenanceFailure)) throw error
    throw new PublicationUnknown(unknown, error)
  }
}
