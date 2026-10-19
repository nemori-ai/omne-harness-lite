// @module-tag slow
// Runs the install-closure CLI as a child process (node, and pnpm for the real member) on inputs
// that it must refuse. The pure judgments are in install-judgment.spec.ts.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import type { Report } from './install/consumer.ts'

// The facility must be able to fail. The forbidden-dependency cases feed it declarations that the
// policy forbids and assert that it exits non-zero and names the offending package, without packing
// or installing anything. The real install of the unmodified member is install-consumer.spec.ts.
const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = join(packageDirectory, '..', '..', '..')
const policyPath = join(packageDirectory, 'tests/fixtures/install-policy.json')
const cli = join(packageDirectory, 'tests/install/cli.ts')
const temporary = mkdtempSync(join(tmpdir(), 'install-closure-'))
const consumers = join(workspaceRoot, 'tmp/install-closure')
const workDirectories = ['negative', 'offline'].map(name =>
  join(consumers, `model-contract-closure-${name}`),
)
afterAll(() => {
  rmSync(temporary, { recursive: true, force: true })
  for (const directory of workDirectories) rmSync(directory, { recursive: true, force: true })
})
const [negativeDirectory, offlineDirectory] = workDirectories as [string, string]

/** The vitest bin shim sets NODE_PATH, and a developer shell may allow the network: strip both. */
function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const { NODE_PATH: _path, OMNE_INSTALL_ALLOW_NETWORK: _network, ...rest } = process.env
  return { ...rest, ...extra }
}

function runCli(member: string, args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      cli,
      '--member',
      member,
      '--workspace-root',
      workspaceRoot,
      '--policy',
      policyPath,
      ...args,
    ],
    { encoding: 'utf8', env: cleanEnv(env) },
  )
  const report = (): Report => JSON.parse(result.stdout) as Report
  return { status: result.status, stderr: result.stderr, report }
}

/** A copy of the real member manifest with one extra production dependency. */
function injected(name: string, version: string): string {
  const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
  manifest.dependencies = { ...manifest.dependencies, [name]: version }
  const directory = join(temporary, `inject-${name.replace(/\W/gu, '-')}`)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest))
  return directory
}

/**
 * A built member with one third-party dependency, so the install step has something to fetch. It
 * lives in the temporary directory, so a run that deletes its member or work directory can only
 * delete this one. Cases that exercise the work-directory guard must never name a repository path.
 */
function builtMember(): string {
  const directory = mkdtempSync(join(temporary, 'member-'))
  mkdirSync(join(directory, 'dist'))
  mkdirSync(join(directory, 'node_modules'))
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      name: '@fixture/member',
      version: '1.0.0',
      type: 'module',
      files: ['dist'],
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      dependencies: { 'is-number': '7.0.0' },
    }),
  )
  writeFileSync(join(directory, 'dist/index.js'), 'export const value = 1\n')
  writeFileSync(join(directory, 'dist/index.d.ts'), 'export declare const value: 1\n')
  return directory
}

describe('install-closure CLI refuses forbidden dependencies', () => {
  it.each([
    ['@deepseek-ai/cordis', '4.0.4', 'cordis'],
    ['@omne-harness/model-host-local', 'workspace:*', 'model-runtime-provider'],
    ['@earendil-works/pi-tui', '1.0.0', 'pi'],
    ['openai', '1.0.0', 'vendor-sdk'],
    ['js-tiktoken', '1.0.21', 'tokenizer-engine'],
    ['kysely', '0.29.6', 'storage-engine'],
  ])('fails and names %s', (name, version, category) => {
    const { status, report } = runCli(injected(name, version), ['--work-dir', negativeDirectory])
    const parsed = report()
    expect(status).toBe(1)
    expect(parsed.ok).toBe(false)
    expect(parsed.forbidden).toContainEqual({ name, category, via: [parsed.member, name] })
    expect(parsed.tarballs).toEqual([])
  })

  it('refuses to run with NODE_PATH set', () => {
    const { status, report } = runCli(builtMember(), ['--work-dir', negativeDirectory], {
      NODE_PATH: '/somewhere',
    })
    expect(status).toBe(1)
    expect(report().checks.find(check => check.id === 'node-path-unset')?.ok).toBe(false)
  })
})

describe('install-closure CLI guards the work directory', () => {
  it('refuses the member directory and leaves it intact', () => {
    const member = builtMember()
    const { status, stderr } = runCli(member, ['--work-dir', member])
    expect(status).toBe(2)
    expect(stderr).toContain('refusing work directory')
    expect(existsSync(join(member, 'package.json'))).toBe(true)
    expect(existsSync(join(member, 'dist/index.js'))).toBe(true)
  })

  it('refuses a directory outside the allowed roots and keeps its content', () => {
    const member = builtMember()
    const stranger = mkdtempSync(join(temporary, 'stranger-'))
    const precious = join(stranger, 'precious.txt')
    writeFileSync(precious, 'keep')
    const { status, stderr } = runCli(member, ['--work-dir', stranger])
    expect(status).toBe(2)
    expect(stderr).toContain('refusing work directory')
    expect(readFileSync(precious, 'utf8')).toBe('keep')
  })

  it('refuses a non-empty directory without the marker and keeps its content', () => {
    const member = builtMember()
    const guarded = join(member, 'tmp', 'guard')
    mkdirSync(guarded, { recursive: true })
    const precious = join(guarded, 'precious.txt')
    writeFileSync(precious, 'keep')
    const { status, stderr } = runCli(member, ['--work-dir', guarded])
    expect(status).toBe(2)
    expect(stderr).toContain('without .install-closure-consumer')
    expect(readFileSync(precious, 'utf8')).toBe('keep')
  })
})

describe('install-closure CLI does not fall back to the network by itself', () => {
  it('fails the run when --offline fails and --allow-network is absent', () => {
    // An empty store holds no tarball and no metadata, so `pnpm install --offline` cannot succeed.
    const store = mkdtempSync(join(temporary, 'empty-store-'))
    const { status, report } = runCli(builtMember(), [
      '--work-dir',
      offlineDirectory,
      '--store-dir',
      store,
    ])
    const parsed = report()
    expect(status).toBe(1)
    expect(parsed.ok).toBe(false)
    expect(parsed.install).toEqual({ mode: 'offline', allowNetwork: false })
    const install = parsed.checks.find(check => check.id === 'install')
    expect(install?.ok).toBe(false)
    expect(install?.detail).toContain('network is not allowed')
  })
})
