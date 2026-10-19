import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Options, Report } from './install/consumer.ts'
import { fixtureNames, readRoles, runFixtureSet } from './install/fixture-set.ts'

// The set of fixtures is judged from the reports of its runs, so a fake run stands in for the
// install and each case feeds the set one report that it must not let through. The real run of
// the fixtures of this member is fixtures-run.spec.ts.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'install-fixture-set-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function consumers(name: string, roles: unknown, directories: readonly string[]): string {
  const directory = join(root, name)
  mkdirSync(directory, { recursive: true })
  if (roles !== undefined) writeFileSync(join(directory, 'roles.json'), JSON.stringify(roles))
  for (const item of directories) mkdirSync(join(directory, item), { recursive: true })
  return directory
}

const member = join(root, 'member')
mkdirSync(member)
writeFileSync(join(member, 'package.json'), JSON.stringify({ name: '@m/one' }))

const passing = (role: string): NonNullable<Report['fixture']> => ({
  role,
  directory: `/fixtures/${role}`,
  paths: [
    { name: 'works', kind: 'normal', ok: true },
    { name: 'recovers', kind: 'failure', decision: 'retry', ok: true },
  ],
})

function reportOf(overrides: Partial<Report> = {}): Report {
  return {
    member: '@m/one',
    profile: 'p',
    workspaceRoot: '/w',
    consumerDirectory: '/c',
    closure: { workspace: [], external: [] },
    install: { mode: 'offline', allowNetwork: false },
    installed: [],
    forbidden: [],
    tarballs: [],
    probe: [],
    typeCheck: { files: 0 },
    checks: [],
    ok: true,
    ...overrides,
  }
}

const options = {
  memberDirectory: member,
  workspaceRoot: root,
  policy: { profile: 'p', forbidden: [] },
  allowNetwork: false,
}

function run(directory: string, answer: (options: Options) => Report) {
  return runFixtureSet(
    { ...options, consumersDirectory: directory, workDirectory: join(root, 'work') },
    answer,
  )
}

/** A run that passes every fixture, reporting the role from the last part of the directory. */
const passAll = (given: Options): Report =>
  reportOf({ fixture: passing(given.fixtureDirectory?.split('/').pop() ?? '') })

describe('readRoles', () => {
  it('reads the roles of a roles file', () => {
    expect(readRoles(consumers('roles-ok', { roles: ['a', 'b'] }, []))).toEqual({
      roles: ['a', 'b'],
    })
  })

  it('says why a roles file cannot be used: missing, not JSON, not a list of names or empty', () => {
    expect(readRoles(consumers('roles-missing', undefined, []))).toMatchObject({
      problem: expect.stringContaining('does not exist'),
    })
    const broken = consumers('roles-broken', undefined, [])
    writeFileSync(join(broken, 'roles.json'), '{ nope')
    expect(readRoles(broken)).toMatchObject({ problem: expect.stringContaining('is not JSON') })
    for (const [name, value] of [
      ['roles-null', null],
      ['roles-array', []],
      ['roles-numbers', { roles: [1] }],
      ['roles-empty', { roles: [] }],
      ['roles-text', { roles: 'a' }],
    ] as const)
      expect(readRoles(consumers(name, value, []))).toMatchObject({
        problem: expect.stringContaining('must hold {"roles": [...]}'),
      })
  })
})

describe('fixtureNames', () => {
  it('lists the fixture directories in order and ignores files', () => {
    const directory = consumers('names', { roles: ['x'] }, ['zeta', 'alpha'])
    expect(fixtureNames(directory)).toEqual(['alpha', 'zeta'])
  })

  it('lists nothing for a directory that does not exist', () => {
    expect(fixtureNames(join(root, 'absent'))).toEqual([])
  })
})

describe('runFixtureSet', () => {
  it('passes when every required role has a fixture whose run passed, and runs each in a directory named after its role', () => {
    const directory = consumers('set-ok', { roles: ['alpha', 'beta'] }, ['alpha', 'beta'])
    const seen: string[] = []
    const report = run(directory, given => {
      seen.push(given.consumerDirectory)
      return passAll(given)
    })
    expect(report.ok).toBe(true)
    expect(report.problems).toEqual([])
    expect(report.member).toBe('@m/one')
    expect(
      report.fixtures.map(item => [item.role, item.ok, item.paths.map(path => path.name)]),
    ).toEqual([
      ['alpha', true, ['works', 'recovers']],
      ['beta', true, ['works', 'recovers']],
    ])
    expect(seen).toEqual([join(root, 'work', 'alpha'), join(root, 'work', 'beta')])
  })

  it('fails when a required role has no fixture, even though every fixture that exists passed', () => {
    const directory = consumers('set-missing', { roles: ['alpha', 'beta'] }, ['alpha'])
    const report = run(directory, passAll)
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual(['fixture beta: required role has no fixture'])
    expect(report.fixtures.every(item => item.ok)).toBe(true)
  })

  it('fails when the roles file cannot be used, because nothing then says which fixtures are required', () => {
    const directory = consumers('set-noroles', undefined, ['alpha'])
    const report = run(directory, passAll)
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual([expect.stringContaining('does not exist')])
  })

  it('fails when there is no fixture at all', () => {
    const report = run(consumers('set-none', { roles: ['alpha'] }, []), passAll)
    expect(report.ok).toBe(false)
    expect(report.fixtures).toEqual([])
  })

  it('fails when one fixture failed, and names the checks that did not pass with what they found', () => {
    const directory = consumers('set-red', { roles: ['alpha', 'beta'] }, ['alpha', 'beta'])
    const report = run(directory, given =>
      given.fixtureDirectory?.endsWith('beta') === true
        ? reportOf({
            ok: false,
            checks: [
              { id: 'install', ok: true, detail: 'installed' },
              { id: 'fixture-compile', ok: false, detail: 'error TS2307' },
            ],
          })
        : passAll(given),
    )
    expect(report.ok).toBe(false)
    const beta = report.fixtures.find(item => item.role === 'beta')
    expect(beta).toMatchObject({
      ok: false,
      paths: [],
      failedChecks: [{ id: 'fixture-compile', detail: 'error TS2307' }],
    })
    expect(report.fixtures.find(item => item.role === 'alpha')?.ok).toBe(true)
  })

  it('fails when the manifest of a fixture names another role than its directory', () => {
    const directory = consumers('set-renamed', { roles: ['alpha'] }, ['alpha'])
    const report = run(directory, () => reportOf({ fixture: passing('gamma') }))
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual(['fixture alpha: its manifest names the role gamma'])
  })
})
