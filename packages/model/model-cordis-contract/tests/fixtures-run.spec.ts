// @module-tag slow
// Runs the role fixture of this member through the `fixtures` entry: the plugin is packed from the
// built members, installed offline into a consumer directory of its own, compiled there and run
// there in a real Cordis Context. The refusals of the entry are tested in model-contract, whose
// copy of the facility is byte for byte this one.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isPathResult, isRecord } from './install/fixture-run.ts'
import type { FixtureSetReport, FixtureSummary } from './install/fixture-set.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = join(packageDirectory, '..', '..', '..')
const consumers = join(packageDirectory, 'tests/fixtures/consumers')
// A directory of this run alone: another member's spec runs the same entry at the same time.
const workDirectory = join(
  workspaceRoot,
  'tmp/install-closure',
  `fixtures-model-cordis-contract-${process.pid}`,
)
const ROLES = ['cordis-plugin']
/** Packing and installing the closure takes longer than the default time of a hook. */
const RUN_LIMIT_MS = 300_000
/** The entry kills a stuck fixture after a minute; this one turns a stuck entry into a failure. */
const ENTRY_LIMIT_MS = 240_000
afterAll(() => rmSync(workDirectory, { recursive: true, force: true }))

function isSummary(value: unknown): value is FixtureSummary {
  return (
    isRecord(value) &&
    typeof value['role'] === 'string' &&
    typeof value['ok'] === 'boolean' &&
    Array.isArray(value['paths']) &&
    value['paths'].every(isPathResult) &&
    Array.isArray(value['failedChecks'])
  )
}

/** The report that the entry printed, or an error that names the field that is wrong. */
function readReport(text: string): FixtureSetReport {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) throw new Error('the report is not a JSON object')
  const { member, ok, problems, fixtures } = value
  if (typeof member !== 'string' || typeof ok !== 'boolean')
    throw new Error('the set report has no member or ok')
  if (!Array.isArray(problems) || !problems.every(item => typeof item === 'string'))
    throw new Error('the set report problems are wrong')
  if (!Array.isArray(fixtures) || !fixtures.every(isSummary))
    throw new Error('the set report fixtures are wrong')
  return { member, ok, problems, fixtures }
}

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
  return { status: run.status, report: readReport(run.stdout) }
}

describe('the role fixture of the member', () => {
  let ran: ReturnType<typeof runFixtures>
  beforeAll(() => {
    ran = runFixtures()
  }, RUN_LIMIT_MS)

  it('passes, and the required role is exactly the Cordis plugin', () => {
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

  it('gives the plugin a normal path and failure paths that name their decision', () => {
    for (const fixture of ran.report.fixtures) {
      expect(fixture.paths.some(path => path.kind === 'normal')).toBe(true)
      const failures = fixture.paths.filter(path => path.kind === 'failure')
      expect(failures.length).toBeGreaterThan(0)
      for (const path of failures) {
        expect(typeof path.decision).toBe('string')
        expect(path.decision?.trim()).not.toBe('')
      }
      expect(fixture.paths.every(path => path.ok)).toBe(true)
    }
  })

  it('installs nothing into the source tree of the fixtures', () => {
    for (const role of ROLES) expect(existsSync(join(consumers, role, 'node_modules'))).toBe(false)
  })
})
