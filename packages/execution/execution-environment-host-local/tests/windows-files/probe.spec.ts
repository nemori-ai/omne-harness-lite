/** @module-tag slow */
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { probeWindowsFilesPrerequisite } from '../../src/windows-files/facility.ts'

afterEach(() => vi.unstubAllEnvs())

it('proves handle-relative file operations and removes its probe directory', async context => {
  if (process.platform !== 'win32') return context.skip()
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-file-probe-test-')))
  try {
    expect(await probeWindowsFilesPrerequisite(root)).toBe('satisfied')
    expect(await readdir(root)).toEqual([])
    expect(await probeWindowsFilesPrerequisite(join(root, 'missing'))).toBe('unknown')
    expect(await readdir(root)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)

it('reports a genuinely missing PowerShell prerequisite without creating probe files', async context => {
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
