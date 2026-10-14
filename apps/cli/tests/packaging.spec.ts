import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const script = join(repoRoot, 'scripts/package-cli.sh')

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
})
