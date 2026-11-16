// @module-tag slow
// Packs the member, installs the tarball into a directory under tmp/, and runs pnpm, node and tsc in it.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import type { Report } from './install/consumer.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = join(packageDirectory, '..', '..', '..')
const workDirectories = [join(workspaceRoot, 'tmp/install-closure/model-contract-spec')]
afterAll(() => {
  for (const directory of workDirectories) rmSync(directory, { recursive: true, force: true })
})

// The members that the facility packs, in its order: the member itself, then the workspace
// packages of its production closure. A change to the declared dependencies changes this list
// and nothing else in the expected report.
const closureMembers = [
  '@omne-harness/model-contract',
  '@omne-harness/assets',
  '@omne-harness/call-account',
  '@omne-harness/content-block',
  '@omne-harness/exchange-refs',
  '@omne-harness/json-text',
  '@omne-harness/legal-identity',
  '@omne-harness/message',
  '@omne-harness/modality',
  '@omne-harness/operation-result',
  '@omne-harness/stream-arrival',
  '@omne-harness/settings',
  '@omne-harness/utc-instant',
]

// The vitest bin shim sets NODE_PATH, and a developer shell may allow the network: the facility
// must start without either.
const { NODE_PATH: _path, OMNE_INSTALL_ALLOW_NETWORK: _network, ...environment } = process.env

it('installs only the packed closure and every entry resolves inside the consumer', () => {
  const run = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      join(packageDirectory, 'tests/install/cli.ts'),
      '--member',
      packageDirectory,
      '--work-dir',
      workDirectories[0] as string,
    ],
    { encoding: 'utf8', env: environment },
  )
  const report = JSON.parse(run.stdout) as Report
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
  expect(report.probe.map(entry => entry.specifier)).toEqual([
    '@omne-harness/model-contract',
    '@omne-harness/model-contract/provider',
    '@omne-harness/model-contract/provider-asset',
    '@omne-harness/model-contract/conformance',
    '@omne-harness/model-contract/testing',
  ])
  expect(report.forbidden).toEqual([])
  // The consumer was installed by the pnpm that runs this test (npm_execpath), the version pinned by
  // the root devEngines, even though the consumer itself pins none.
  const root = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as {
    devEngines: { packageManager: { version: string } }
  }
  expect(report.install).toEqual({
    mode: 'offline',
    allowNetwork: false,
    pnpm: root.devEngines.packageManager.version,
  })
  // Without a scenario the consumer depends on the target member alone.
  const project = join(workDirectories[0] as string, 'project')
  const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    packageManager?: string
    pnpm?: unknown
  }
  expect(Object.keys(manifest.dependencies)).toEqual(['@omne-harness/model-contract'])
  // pnpm 12 reads overrides only from the consumer's own pnpm-workspace.yaml; the manifest pins no
  // pnpm and has no pnpm field. The store is the run's own, and no registry metadata was read or
  // written to resolve a package.
  expect(manifest.packageManager).toBeUndefined()
  expect(manifest.pnpm).toBeUndefined()
  const workspace = readFileSync(join(project, 'pnpm-workspace.yaml'), 'utf8')
  expect(workspace).toMatch(/^packages: \[\]\noverrides:\n/u)
  expect(existsSync(join(workDirectories[0] as string, 'pnpm-store'))).toBe(true)
  const cached = readdirSync(join(workDirectories[0] as string, 'pnpm-cache'), {
    recursive: true,
    withFileTypes: true,
  })
  // pnpm 12 records the supply-chain check of the consumer's lockfile in the cache
  // (lockfile-verified.jsonl); that is no registry metadata.
  expect(
    cached.filter(entry => entry.isFile() && entry.name !== 'lockfile-verified.jsonl'),
  ).toEqual([])
  expect(run.status).toBe(0)
})
