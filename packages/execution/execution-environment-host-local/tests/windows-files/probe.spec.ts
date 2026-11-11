/** @module-tag slow */
// Prerequisite P2 on Windows: the .NET Framework compiler exists, and the files helper creates,
// reads, lists and removes a file handle-relative. This host is made to have no Windows PowerShell:
// its files are missing to `access`, and starting it fails, so a probe that needed it could not
// answer satisfied.
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { probeWindowsFilesPrerequisite } from '../../src/windows-files/facility.ts'

const powershell = vi.hoisted(() => ({ asked: [] as string[] }))
const isPowershell = (value: unknown) => /powershell/iu.test(String(value))
const missing = (path: unknown) =>
  Object.assign(new Error(`ENOENT: no such file or directory, '${String(path)}'`), {
    code: 'ENOENT',
  })

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    async access(...args: Parameters<typeof actual.access>) {
      if (isPowershell(args[0])) {
        powershell.asked.push(String(args[0]))
        throw missing(args[0])
      }
      return actual.access(...args)
    },
  }
})

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn(...args: Parameters<typeof actual.spawn>): ChildProcess {
      if (isPowershell(args[0])) {
        powershell.asked.push(String(args[0]))
        throw missing(args[0])
      }
      return actual.spawn(...args)
    },
    execFile(...args: Parameters<typeof actual.execFile>) {
      if (isPowershell(args[0])) {
        powershell.asked.push(String(args[0]))
        throw missing(args[0])
      }
      return actual.execFile(...args)
    },
  }
})

afterEach(() => vi.unstubAllEnvs())

it('proves handle-relative file operations without PowerShell and removes its probe directory', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-file-probe-test-')))
  try {
    expect(await probeWindowsFilesPrerequisite(root)).toBe('satisfied')
    expect(await readdir(root)).toEqual([])
    expect(await probeWindowsFilesPrerequisite(join(root, 'missing'))).toBe('unknown')
    expect(await readdir(root)).toEqual([])
    expect(powershell.asked).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('reports a genuinely missing compiler prerequisite without creating probe files', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-file-probe-missing-')))
  try {
    vi.stubEnv('SystemRoot', join(root, 'missing-windows'))
    expect(await probeWindowsFilesPrerequisite(root)).toBe('unsatisfied')
    expect(await readdir(root)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
