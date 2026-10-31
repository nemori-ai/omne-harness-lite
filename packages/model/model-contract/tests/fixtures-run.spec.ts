// @module-tag slow
// Runs the five role fixtures of this member through the `fixtures` entry: each one is packed from
// the built members, installed offline into a consumer directory of its own, compiled there and
// run there. This is the real consumption of the package by the roles; the refusals of the entry
// are in install-fixture.spec.ts.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readSetReport } from './install-reports.ts'
import type { FixtureSetReport } from './install/fixture-set.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = join(packageDirectory, '..', '..', '..')
const consumers = join(packageDirectory, 'tests/fixtures/consumers')
// A directory of this run alone: another member's spec runs the same entry at the same time, and
// removing the shared parent would take the consumer directories of that run away.
const workDirectory = join(
  workspaceRoot,
  'tmp/install-closure',
  `fixtures-model-contract-${process.pid}`,
)
const ROLES = [
  'context',
  'independent-caller',
  'orchestration-coordinator',
  'provider-author',
  'result-consumer',
]
afterAll(() => rmSync(workDirectory, { recursive: true, force: true }))

function runFixtures(): { status: number; report: FixtureSetReport } {
  // The vitest bin shim sets NODE_PATH, and a developer shell may allow the network: strip both.
  const { NODE_PATH: _path, OMNE_INSTALL_ALLOW_NETWORK: _network, ...environment } = process.env
  const run = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      join(packageDirectory, 'tests/install/fixtures.ts'),
      '--member',
      packageDirectory,
      '--workspace-root',
      workspaceRoot,
      '--work-dir',
      workDirectory,
    ],
    { encoding: 'utf8', env: environment, timeout: ENTRY_LIMIT_MS },
  )
  if (run.status === null)
    throw new Error(`the fixtures entry did not finish within ${ENTRY_LIMIT_MS} ms: ${run.signal}`)
  return { status: run.status, report: readSetReport(run.stdout) }
}

/** Packing and installing five consumers takes longer than the default time of a hook. */
const RUN_LIMIT_MS = 300_000
/** The entry itself kills a stuck fixture after a minute; this one turns a stuck entry into a failure. */
const ENTRY_LIMIT_MS = 240_000

describe('the role fixtures of the member', () => {
  let ran: ReturnType<typeof runFixtures>
  beforeAll(() => {
    ran = runFixtures()
  }, RUN_LIMIT_MS)

  it('all pass, and the required roles are exactly the five of the handoff', () => {
    const { status, report } = ran
    expect(report.fixtures.flatMap(item => item.failedChecks)).toEqual([])
    expect(report.problems).toEqual([])
    expect(status).toBe(0)
    expect(report.ok).toBe(true)
    expect(report.fixtures.map(item => item.role)).toEqual(ROLES)
    for (const role of ROLES) expect(existsSync(join(workDirectory, role))).toBe(true)
    expect(JSON.parse(readFileSync(join(consumers, 'roles.json'), 'utf8'))).toEqual({
      roles: ROLES,
    })
  })

  it('give every role a normal path and a failure path that names its decision', () => {
    for (const fixture of ran.report.fixtures) {
      expect(fixture.paths.some(path => path.kind === 'normal')).toBe(true)
      const failures = fixture.paths.filter(path => path.kind === 'failure')
      expect(failures.length).toBeGreaterThan(0)
      for (const path of failures) expect(path.decision?.trim()).not.toBe('')
      expect(fixture.paths.every(path => path.ok)).toBe(true)
    }
  })

  it('install nothing into the source tree of the fixtures', () => {
    for (const role of ROLES) expect(existsSync(join(consumers, role, 'node_modules'))).toBe(false)
  })
})
