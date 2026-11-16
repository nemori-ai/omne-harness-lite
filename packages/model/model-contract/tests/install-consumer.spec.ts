// @module-tag slow
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
  expect(report.install).toEqual({ mode: 'offline', allowNetwork: false })
  const manifest = JSON.parse(
    readFileSync(join(workDirectories[0] as string, 'project/package.json'), 'utf8'),
  ) as { dependencies: Record<string, string>; packageManager: string }
  expect(Object.keys(manifest.dependencies)).toEqual(['@omne-harness/model-contract'])
  const root = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as {
    packageManager: string
  }
  expect(manifest.packageManager).toBe(root.packageManager)
  expect(existsSync(join(workDirectories[0] as string, 'pnpm-store'))).toBe(true)
  const cached = readdirSync(join(workDirectories[0] as string, 'pnpm-cache'), {
    recursive: true,
    withFileTypes: true,
  })
  expect(cached.filter(entry => entry.isFile())).toEqual([])
  expect(run.status).toBe(0)
})
