// @module-tag slow
// Packs the member, installs the tarball into a directory under tmp/, and runs pnpm, node and tsc in it.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import type { Report } from './install/consumer.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = join(packageDirectory, '..', '..', '..')
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'install-consumer-')))
const consumers = join(workspaceRoot, 'tmp/install-closure')
const workDirectories = ['model-cordis-contract-spec', 'model-cordis-contract-transitive']
afterAll(() => {
  rmSync(temporary, { recursive: true, force: true })
  for (const name of workDirectories)
    rmSync(join(consumers, name), { recursive: true, force: true })
})

// The vitest bin shim sets NODE_PATH, and a developer shell may allow the network: the facility
// must start without either.
const { NODE_PATH: _path, OMNE_INSTALL_ALLOW_NETWORK: _network, ...environment } = process.env

// The members that the facility packs, in its order: the member itself, then the workspace
// packages of its production closure. A change to the declared dependencies changes this list
// and nothing else in the expected report.
const closureMembers = [
  '@omne-harness/model-cordis-contract',
  '@omne-harness/legal-identity',
  '@omne-harness/modality',
  '@omne-harness/model-contract',
  '@omne-harness/operation-result',
  '@omne-harness/call-account',
  '@omne-harness/content-block',
  '@omne-harness/json-text',
  '@omne-harness/message',
  '@omne-harness/stream-arrival',
  '@omne-harness/utc-instant',
]

function run(workDirectory: string, policy?: string) {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      join(packageDirectory, 'tests/install/cli.ts'),
      '--member',
      packageDirectory,
      '--work-dir',
      join(consumers, workDirectory),
      ...(policy === undefined ? [] : ['--policy', policy]),
    ],
    { encoding: 'utf8', env: environment },
  )
  return { status: result.status, report: JSON.parse(result.stdout) as Report }
}

it('installs only the packed closure and every entry resolves inside the consumer', () => {
  const { status, report } = run(workDirectories[0] as string)
  expect(report.checks.filter(check => !check.ok)).toEqual([])
  // The complete id set: a judgment that is no longer wired into the report must turn this red.
  expect(report.checks.map(check => check.id)).toEqual([
    'node-path-unset',
    'forbidden-declared',
    'members-built',
    ...closureMembers.flatMap(member => [
      `pack:${member}`,
      `tarball-no-source:${member}`,
      `tarball-no-workspace-protocol:${member}`,
    ]),
    'install',
    'consumer-lock-no-workspace',
    'installed-listed',
    'forbidden-installed',
    'probe-run',
    'resolution-inside-consumer',
    'resolution-no-source',
    'type-check',
    'type-resolution-inside-consumer',
  ])
  expect(report.typeCheck.files).toBeGreaterThan(0)
  expect(report.forbidden).toEqual([])
  expect(report.probe.map(entry => entry.specifier)).toEqual([
    '@omne-harness/model-cordis-contract',
    '@omne-harness/model-cordis-contract/cordis',
  ])
  expect(report.install).toEqual({ mode: 'offline', allowNetwork: false })
  expect(status).toBe(0)
})

it('finds a forbidden package that only arrives as a transitive third-party dependency', () => {
  // The declared closure shows only @deepseek-ai/cordis; its own dependency is visible after install.
  const policy = join(temporary, 'policy.json')
  writeFileSync(
    policy,
    JSON.stringify({
      profile: 'probe',
      forbidden: [{ category: 'transitive-probe', names: ['@deepseek-ai/cosmokit'] }],
    }),
  )
  const { status, report } = run(workDirectories[1] as string, policy)
  expect(status).toBe(1)
  expect(report.forbidden.map(item => item.name)).toEqual(['@deepseek-ai/cosmokit'])
  expect(report.checks.find(check => check.id === 'forbidden-declared')?.ok).toBe(true)
  expect(report.checks.find(check => check.id === 'forbidden-installed')?.ok).toBe(false)
})
