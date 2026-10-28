// @module-tag slow
// Packaging runs a full tsc build and a tar child process.
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const scratch: string[] = []

function packageFixture(root: string) {
  const checkout = join(root, 'repo')
  for (const file of [
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'scripts/package-cli.sh',
  ]) {
    const target = join(checkout, file)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(repoRoot, file), target)
  }
  const member = join(checkout, 'apps/cli')
  cpSync(join(repoRoot, 'apps/cli'), member, {
    recursive: true,
    filter: source => !['node_modules', '.turbo'].includes(basename(source)),
  })
  symlinkSync(join(repoRoot, 'node_modules'), join(checkout, 'node_modules'), 'dir')
  symlinkSync(join(repoRoot, 'apps/cli/node_modules'), join(member, 'node_modules'), 'dir')
  return {
    checkout,
    script: join(checkout, 'scripts/package-cli.sh'),
    memberDist: join(member, 'dist'),
  }
}

/** Inode and modification time of every entry under the member's dist; a delete-and-rebuild changes them. */
function identities(memberDist: string): Map<string, string> {
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
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('package-cli.sh', () => {
  it('archives a fresh dist without touching the member dist, and refuses to overwrite', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-cli-package-')))
    scratch.push(dir)
    const { checkout, script, memberDist } = packageFixture(dir)
    // The turbo test task depends on build, so dist exists here.
    expect(existsSync(memberDist)).toBe(true)
    const sentinel = join(memberDist, '.packaging-sentinel')
    writeFileSync(sentinel, '')
    const before = identities(memberDist)
    const output = join(dir, 'output')
    mkdirSync(output)
    const target = join(output, 'omne-cli.tar.gz')
    execFileSync(script, [target], { cwd: checkout, stdio: 'inherit' })
    expect(identities(memberDist)).toEqual(before)
    const names = execFileSync('tar', ['-tzf', target], { encoding: 'utf8' }).split('\n')
    expect(names).toContain('dist/bin.js')
    expect(names).toContain('dist/cli-identity.json')
    expect(names).not.toContain('dist/.packaging-sentinel')
    expect(names.filter(name => name.endsWith('.map'))).toEqual([])
    expect(() => execFileSync(script, [target], { cwd: checkout, stdio: 'pipe' })).toThrow()
    expect(readdirSync(output)).toEqual(['omne-cli.tar.gz'])
  })
})
