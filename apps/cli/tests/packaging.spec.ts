// @module-tag slow
// Packaging runs a full tsc build and a tar child process.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const script = join(repoRoot, 'scripts/package-cli.sh')
const memberDist = join(repoRoot, 'apps/cli/dist')

/** Digest of every file path and content under the member's dist; null when dist is absent. */
function digestDist(): string | null {
  if (!existsSync(memberDist)) return null
  const hash = createHash('sha256')
  const files = readdirSync(memberDist, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .sort()
  for (const file of files) hash.update(file).update('\0').update(readFileSync(file))
  return hash.digest('hex')
}

describe('package-cli.sh', () => {
  it('writes a new archive of dist and refuses to overwrite it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omne-cli-package-'))
    const target = join(dir, 'omne-cli.tar.gz')
    execFileSync(script, [target], { cwd: repoRoot, stdio: 'inherit' })
    const names = execFileSync('tar', ['-tzf', target], { encoding: 'utf8' })
    expect(names).toContain('dist/bin.js')
    expect(names).toContain('dist/cli-identity.json')
    expect(existsSync(target)).toBe(true)
    expect(() => execFileSync(script, [target], { cwd: repoRoot, stdio: 'pipe' })).toThrow()
  })

  it('leaves the member dist untouched while packaging', () => {
    const before = digestDist()
    const dir = mkdtempSync(join(tmpdir(), 'omne-cli-package-'))
    execFileSync(script, [join(dir, 'omne-cli.tar.gz')], { cwd: repoRoot, stdio: 'pipe' })
    expect(digestDist()).toBe(before)
  })
})
