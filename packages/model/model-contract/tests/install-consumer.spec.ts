// @module-tag slow
// Packs the member, installs the tarball into a directory under tmp/, and runs pnpm, node and tsc in it.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
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
    'pack:@omne-harness/model-contract',
    'tarball-no-source:@omne-harness/model-contract',
    'tarball-no-workspace-protocol:@omne-harness/model-contract',
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
  expect(run.status).toBe(0)
})
