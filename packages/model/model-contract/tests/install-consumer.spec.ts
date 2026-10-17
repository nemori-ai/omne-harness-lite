// @module-tag slow
// Packs the member, installs the tarball into a directory under tmp/, and runs pnpm, node and tsc in it.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
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
  '@omne-harness/call-account',
  '@omne-harness/content-block',
  '@omne-harness/json-text',
  '@omne-harness/legal-identity',
  '@omne-harness/message',
  '@omne-harness/operation-result',
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
  expect(report.probe.map(entry => entry.specifier)).toEqual(['@omne-harness/model-contract'])
  expect(report.forbidden).toEqual([])
  expect(report.install).toEqual({ mode: 'offline', allowNetwork: false })
  // Without a scenario the consumer depends on the target member alone.
  const manifest = JSON.parse(
    readFileSync(join(workDirectories[0] as string, 'project/package.json'), 'utf8'),
  ) as { dependencies: Record<string, string> }
  expect(Object.keys(manifest.dependencies)).toEqual(['@omne-harness/model-contract'])
  expect(run.status).toBe(0)
})
