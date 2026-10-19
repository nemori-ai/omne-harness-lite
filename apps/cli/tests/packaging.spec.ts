// @module-tag slow
// Packaging runs a full tsc build and a tar child process.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const script = join(repoRoot, 'scripts/package-cli.sh')
const memberDist = join(repoRoot, 'apps/cli/dist')
const sentinel = join(memberDist, '.packaging-sentinel')
const scratch: string[] = []

/** Inode and modification time of every entry under the member's dist; a delete-and-rebuild changes them. */
function identities(): Map<string, string> {
  const entries = readdirSync(memberDist, { recursive: true, withFileTypes: true })
  return new Map(
    entries.map(entry => {
      const path = join(entry.parentPath, entry.name)
      const stat = statSync(path)
      return [path, `${stat.ino}:${stat.mtimeMs}`]
    }),
  )
}

afterEach(() => {
  rmSync(sentinel, { force: true })
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('package-cli.sh', () => {
  it('archives a fresh dist without touching the member dist, and refuses to overwrite', () => {
    // The member's test script builds first, so dist exists here.
    expect(existsSync(memberDist)).toBe(true)
    writeFileSync(sentinel, '')
    const before = identities()
    const dir = mkdtempSync(join(tmpdir(), 'omne-cli-package-'))
    scratch.push(dir)
    const target = join(dir, 'omne-cli.tar.gz')
    execFileSync(script, [target], { cwd: repoRoot, stdio: 'inherit' })
    expect(identities()).toEqual(before)
    const names = execFileSync('tar', ['-tzf', target], { encoding: 'utf8' }).split('\n')
    expect(names).toContain('dist/bin.js')
    expect(names).toContain('dist/cli-identity.json')
    expect(names).not.toContain('dist/.packaging-sentinel')
    expect(names.filter(name => name.endsWith('.map'))).toEqual([])
    expect(() => execFileSync(script, [target], { cwd: repoRoot, stdio: 'pipe' })).toThrow()
    expect(readdirSync(dir)).toEqual(['omne-cli.tar.gz'])
  })
})
