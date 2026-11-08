import { execFile } from 'node:child_process'
import { lstat, mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** An owned APFS image supplies a second device without sudo or a Finder window. */
export async function apfsVolume(mountpoint?: string) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'omne-files-volume-')))
  const mount = mountpoint ?? join(base, 'mount')
  if (mountpoint === undefined) await mkdir(mount)
  const before = await lstat(mount)
  try {
    await run(
      '/usr/bin/hdiutil',
      [
        'create',
        '-size',
        '64m',
        '-fs',
        'APFS',
        '-type',
        'SPARSE',
        '-volname',
        'OmneFilesFixture',
        join(base, 'volume'),
      ],
      { timeout: 60_000 },
    )
    await run(
      '/usr/bin/hdiutil',
      ['attach', '-nobrowse', '-mountpoint', mount, join(base, 'volume.sparseimage')],
      { timeout: 60_000 },
    )
  } catch (error) {
    if ((await lstat(mount)).dev !== before.dev)
      await run('/usr/bin/hdiutil', ['detach', '-force', mount], { timeout: 60_000 })
    await rm(base, { recursive: true, force: true })
    throw error
  }
  return {
    path: await realpath(mount),
    async dispose() {
      // All assertions have finished; this image belongs only to the fixture.
      // A busy disposable volume must not keep teardown running into the next case.
      await run('/usr/bin/hdiutil', ['detach', '-force', mount], { timeout: 60_000 })
      await rm(base, { recursive: true, force: true })
    },
  }
}
