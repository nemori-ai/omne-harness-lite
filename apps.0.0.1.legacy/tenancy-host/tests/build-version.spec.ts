import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { buildVersionText, printBuildVersion } from '../src/build-version.ts'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'omne-host-version-'))
  roots.push(root)
  return { root, marker: pathToFileURL(join(root, 'BUILD_ID')) }
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
it('prints a valid build marker or development without loading any deployment configuration', async () => {
  const f = await fixture()
  expect(await buildVersionText(f.marker)).toBe('tenancy-host 0.0.0 development\n')
  await writeFile(f.marker, 'a'.repeat(64) + '\n')
  expect(await buildVersionText(f.marker)).toBe('tenancy-host 0.0.0 ' + 'a'.repeat(64) + '\n')
})
it.each(['malformed', 'symlink', 'directory', 'fifo'])(
  'rejects %s marker without outputting its contents or blocking',
  async kind => {
    const f = await fixture()
    if (kind === 'malformed') await writeFile(f.marker, 'private input\x1b[2J')
    if (kind === 'directory') await mkdir(f.marker)
    if (kind === 'fifo') execFileSync('mkfifo', [f.marker.pathname])
    if (kind === 'symlink') {
      await writeFile(join(f.root, 'actual'), 'a'.repeat(64))
      await symlink(join(f.root, 'actual'), f.marker)
    }
    const io = { stdout: vi.fn(async () => {}), stderr: vi.fn(async () => {}) }
    expect(await printBuildVersion(io, f.marker)).toBe(1)
    expect(io.stdout).not.toHaveBeenCalled()
    expect(io.stderr).toHaveBeenCalledExactlyOnceWith('tenancy-host: version unavailable\n')
  },
)
it('waits for real output completion and retains failure when diagnostics also fail', async () => {
  const f = await fixture()
  let reject!: (error: Error) => void
  const gate = new Promise<void>((_, no) => {
    reject = no
  })
  const io = {
    stdout: vi.fn(() => gate),
    stderr: vi.fn(async () => {
      throw new Error('broken stderr')
    }),
  }
  let settled = false
  const task = printBuildVersion(io, f.marker).then(code => {
    settled = true
    return code
  })
  await vi.waitFor(() => expect(io.stdout).toHaveBeenCalledTimes(1))
  expect(settled).toBe(false)
  reject(new Error('broken stdout'))
  expect(await task).toBe(1)
})
