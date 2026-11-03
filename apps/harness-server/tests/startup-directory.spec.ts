// prepareStartupDirectory prepares the tenant directory only for the enabled real directory, and takes
// the storage location from the real storage row, whatever else the row list holds before it.
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { RowSpec } from '../src/loader.ts'
import { DOMAIN_RULE } from '../src/rows/session-storage/config.ts'
import { prepareStartupDirectory } from '../src/startup-directory.ts'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'startup-directory-'))
  made.push(dir)
  return dir
}

const spec = (id: string, implementation: 'real' | 's0-double', config: Record<string, unknown>) =>
  ({ row: { id, config }, implementation }) as unknown as RowSpec
const storage = (implementation: 'real' | 's0-double', storageRoot: string) =>
  spec('storage', implementation, { storageRoot })
const session = (implementation: 'real' | 's0-double', directoryFile: string) =>
  spec('session-storage', implementation, {
    combinationVersion: '1',
    directoryFile,
    domainRule: DOMAIN_RULE,
  })

describe('prepareStartupDirectory', () => {
  it('creates the directory file in the root of the real storage row, not of an earlier row', () => {
    const base = scratch()
    const decoyRoot = join(base, 'decoy-root')
    const realRoot = join(base, 'real-root')
    const directoryFile = join(realRoot, 'directory.sqlite')
    prepareStartupDirectory([
      spec('identity', 'real', { storageRoot: join(base, 'identity-root') }),
      storage('s0-double', decoyRoot),
      storage('real', realRoot),
      session('real', directoryFile),
    ])
    expect(existsSync(directoryFile)).toBe(true)
    expect(existsSync(decoyRoot)).toBe(false)
    expect(existsSync(join(base, 'identity-root'))).toBe(false)
  })

  it('does nothing when the directory is not the enabled real one', () => {
    const base = scratch()
    const directoryFile = join(base, 'root', 'directory.sqlite')
    // Neither a double directory nor a missing one needs a storage row.
    expect(() => prepareStartupDirectory([session('s0-double', directoryFile)])).not.toThrow()
    expect(() => prepareStartupDirectory([])).not.toThrow()
    expect(() =>
      prepareStartupDirectory([
        storage('real', join(base, 'root')),
        session('s0-double', directoryFile),
      ]),
    ).not.toThrow()
    expect(existsSync(join(base, 'root'))).toBe(false)
  })

  it('refuses a real directory when no real storage row exists', () => {
    const base = scratch()
    const directoryFile = join(base, 'root', 'directory.sqlite')
    expect(() =>
      prepareStartupDirectory([
        storage('s0-double', join(base, 'root')),
        session('real', directoryFile),
      ]),
    ).toThrow('real directory requires a real storage row')
    expect(existsSync(join(base, 'root'))).toBe(false)
  })
})
