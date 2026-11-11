/** @module-tag slow */
// A copy streams through the files helper: copying 128 MiB answers within the request bound and keeps
// the helper's peak working set below 64 MiB. Slow: it writes and flushes 256 MiB, and it starts
// Windows PowerShell once to read the peak of the helper process.
import { createHash } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { beforeEach, expect, it, vi } from 'vitest'
import { hostObjectToken } from '../../src/host-files.ts'
import { request, withFiles } from './fixture.ts'

const spawned = vi.hoisted(() => ({ children: [] as ChildProcess[] }))
const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return {
    ...original,
    spawn(...args: Parameters<typeof original.spawn>) {
      const child = original.spawn(...args)
      spawned.children.push(child)
      return child
    },
  }
})

beforeEach(context => context.skip(process.platform !== 'win32'))

const mebibyte = 1 << 20

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function peakWorkingSet(pid: number): Promise<number> {
  const { stdout } = await promisify(actual.execFile)(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).PeakWorkingSet64`],
    { windowsHide: true },
  )
  return Number(stdout.trim())
}

it('copies 128 MiB in the helper with a peak working set below 64 MiB', async () => {
  await withFiles(async ({ files, root }) => {
    const source = join(root, 'large.bin')
    const handle = await open(source, 'w')
    try {
      const block = Buffer.alloc(mebibyte)
      for (let index = 0; index < 128; index++) {
        block.fill(index)
        block.writeUInt32LE(index, 0)
        await handle.write(block)
      }
    } finally {
      await handle.close()
    }
    const target = join(root, 'copy.bin')
    const copied = await files.copy({
      ...request(source, await hostObjectToken(source)),
      target: { path: target, named: await hostObjectToken(root) },
      replace: false,
    })
    expect(copied).toMatchObject({ kind: 'done', value: { target: { writeEffect: 'created' } } })
    expect(await digest(target)).toBe(await digest(source))
    const helper = spawned.children.find(child => child.spawnfile.endsWith('files.exe'))
    if (helper?.pid === undefined) throw new Error('the files helper did not start')
    expect(await peakWorkingSet(helper.pid)).toBeLessThan(64 * mebibyte)
  })
}, 120_000)
