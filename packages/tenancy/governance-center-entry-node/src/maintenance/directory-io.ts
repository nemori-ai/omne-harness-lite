import { ownResourceAt } from './resources.ts'
import { constants } from 'node:fs'
import { open, lstat, type FileHandle } from 'node:fs/promises'
import type { SnapshotInspectionSession } from '@omne-harness-lite/storage'
import { MaintenanceFailure, withCleanup } from './failure.ts'

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
