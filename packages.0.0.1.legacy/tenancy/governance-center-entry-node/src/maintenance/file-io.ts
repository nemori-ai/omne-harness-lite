import { link, lstat, open, unlink, opendir, mkdir, statfs } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { ownResourceAt } from './resources.ts'
import { withCleanup } from './failure.ts'
import { useInput } from './input-io.ts'
import { MaintenanceDirectory } from './directory-io.ts'
import type { FileEffects } from './maintenance-ports.ts'

export const fileEffects: FileEffects = {
  useInput,
  useDirectory: (path, session, privateOnly, work) =>
    MaintenanceDirectory.use(path, session, privateOnly, work),
  async useTemporary(root, session, work, cleanupFailed) {
    const path = join(root, `export-${randomBytes(16).toString('hex')}`)
    const handle = await open(path, 'wx', 0o600)
    const close = ownResourceAt(
      session,
      () => handle.close(),
      () => handle.fd < 0,
      path,
    )
    return withCleanup(
      () =>
        work({
          path,
          write: async bytes => {
            await handle.writeFile(bytes)
          },
          sync: () => handle.sync(),
        }),
      async () => {
        try {
          await withCleanup(close, async () => {
            // A failed close retains its owned file.
            if (handle.fd >= 0) return
            await unlink(path)
          })
        } catch (error) {
          cleanupFailed(error, path)
        }
      },
    )
  },
  async withNames(path, session, work) {
    const directory = await opendir(path)
    let closed = false
    const close = ownResourceAt(
      session,
      async () => {
        await directory.close()
        closed = true
      },
      () => closed,
      path,
    )
    return withCleanup(
      () =>
        work({
          async read() {
            const entry = await directory.read()
            return entry === null ? null : entry.name
          },
        }),
      close,
    )
  },
  async isPlainFile(path) {
    const info = await lstat(path)
    return info.isFile() && !info.isSymbolicLink()
  },
  link,
  async mkdir(path) {
    await mkdir(path, { mode: 0o700 })
  },
  space: path => statfs(path),
}
