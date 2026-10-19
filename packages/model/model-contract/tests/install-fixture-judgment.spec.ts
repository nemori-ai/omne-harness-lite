import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { PathResult } from './fixture-runner.ts'
import { readEntryReport, readSetReport } from './install-reports.ts'
import { findForbidden, judgeInstalled } from './install/closure.ts'
import { judgeOutcome, readOutcome } from './install/fixture-run.ts'
import {
  directDependencies,
  fixtureClosure,
  outsideClosure,
  readFixture,
  withFixtureForbidden,
  type FixtureSpec,
} from './install/fixture-spec.ts'
import { missingCheckIds, requiredCheckIds } from './install/judgment.ts'

// Each judgment that a fixture run adds gets an input that it must reject. A judgment that always
// passed would leave the real fixture run green, so these cases show that the instrument can fail.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'install-fixture-judgment-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function write(path: string, text: string): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return path
}

/** A fixture directory with every file, and the declarations that `declared` holds. */
function fixtureDirectory(name: string, declared: Record<string, unknown>): string {
  const directory = join(root, name)
  for (const file of ['tsconfig.json', 'fixture.ts']) write(join(directory, file), '')
  write(join(directory, 'fixture.json'), JSON.stringify(declared))
  return directory
}

const complete = {
  role: 'caller',
  dependencies: ['@a/two', '@a/one'],
  forbidden: ['@a/banned', 'banned-*'],
}

describe('readFixture', () => {
  it('reads the role, the sorted dependencies and the forbidden names of a complete fixture', () => {
    const read = readFixture(fixtureDirectory('complete', complete))
    expect(read).toEqual({
      kind: 'read',
      spec: {
        directory: join(root, 'complete'),
        role: 'caller',
        dependencies: ['@a/one', '@a/two'],
        forbidden: ['@a/banned', 'banned-*'],
      },
    })
  })

  it('takes a fixture without a forbidden list as one that forbids nothing of its own', () => {
    const { forbidden: _forbidden, ...bare } = complete
    expect(readFixture(fixtureDirectory('bare', bare))).toMatchObject({
      kind: 'read',
      spec: { forbidden: [] },
    })
  })

  it('names the files that a fixture directory lacks', () => {
    const directory = join(root, 'empty')
    mkdirSync(directory)
    expect(readFixture(directory)).toEqual({
      kind: 'unreadable',
      detail: `${directory} lacks fixture.json, tsconfig.json, fixture.ts`,
    })
  })

  it('refuses declarations that are not JSON or not an object', () => {
    const broken = fixtureDirectory('broken', {})
    writeFileSync(join(broken, 'fixture.json'), '{ not json')
    expect(readFixture(broken)).toMatchObject({
      kind: 'unreadable',
      detail: expect.stringContaining('not a JSON object'),
    })
    const list = fixtureDirectory('list', {})
    writeFileSync(join(list, 'fixture.json'), '[]')
    expect(readFixture(list)).toMatchObject({
      kind: 'unreadable',
      detail: expect.stringContaining('not a JSON object'),
    })
  })

  it('refuses a fixture that declares no dependency, since it would install nothing to run against', () => {
    const none = readFixture(fixtureDirectory('none', { ...complete, dependencies: [] }))
    expect(none).toEqual({ kind: 'unreadable', detail: 'the fixture declares no dependencies' })
    const missing = readFixture(fixtureDirectory('missing', { role: 'caller' }))
    expect(missing).toEqual({ kind: 'unreadable', detail: 'the fixture declares no dependencies' })
    const named = readFixture(fixtureDirectory('numbers', { ...complete, dependencies: [1] }))
    expect(named).toMatchObject({ kind: 'unreadable' })
  })

  it('refuses declarations with no role or with a forbidden list that is not names', () => {
    const { role: _role, ...norole } = complete
    expect(readFixture(fixtureDirectory('norole', norole))).toEqual({
      kind: 'unreadable',
      detail: 'fixture.json has no role',
    })
    expect(readFixture(fixtureDirectory('emptyrole', { ...complete, role: '' }))).toMatchObject({
      kind: 'unreadable',
    })
    expect(readFixture(fixtureDirectory('badlist', { ...complete, forbidden: [1] }))).toEqual({
      kind: 'unreadable',
      detail: 'forbidden is not a list of names',
    })
  })
})

const spec: FixtureSpec = {
  directory: '/fixture',
  role: 'caller',
  dependencies: ['@a/one', '@a/two'],
  forbidden: ['@a/banned', 'banned-*'],
}

describe('fixture dependencies against the member closure', () => {
  it('lists the declared packages that the closure does not contain', () => {
    expect(outsideClosure(spec, new Set(['@a/one']))).toEqual(['@a/two'])
    expect(outsideClosure(spec, new Set(['@a/one', '@a/two', '@a/three']))).toEqual([])
  })

  it('adds the forbidden names of the fixture as one more category, and only when there are some', () => {
    const policy = { profile: 'p', forbidden: [{ category: 'cordis', names: ['cordis'] }] }
    const widened = withFixtureForbidden(policy, spec)
    expect(
      findForbidden(
        [
          { name: 'banned-x', via: ['x'] },
          { name: 'cordis', via: ['y'] },
        ],
        widened,
      ),
    ).toEqual([
      { name: 'banned-x', category: 'fixture:caller', via: ['x'] },
      { name: 'cordis', category: 'cordis', via: ['y'] },
    ])
    expect(withFixtureForbidden(policy, { ...spec, forbidden: [] })).toBe(policy)
  })

  it('maps a workspace package to its tarball and a third-party package to its one pinned version', () => {
    const tarballs = new Map([['@a/one', '/packs/one.tgz']])
    const pins = new Map([['@a/two', new Set(['1.2.3'])]])
    expect(directDependencies(spec, tarballs, pins)).toEqual({
      kind: 'resolved',
      dependencies: { '@a/one': 'file:/packs/one.tgz', '@a/two': '1.2.3' },
    })
  })

  it('reports a third-party package with no pin, two pins or only a link, instead of guessing a version', () => {
    const tarballs = new Map([['@a/one', '/packs/one.tgz']])
    expect(directDependencies(spec, tarballs, new Map())).toEqual({
      kind: 'unpinned',
      names: ['@a/two'],
    })
    expect(
      directDependencies(spec, tarballs, new Map([['@a/two', new Set(['1.0.0', '2.0.0'])]])),
    ).toEqual({ kind: 'unpinned', names: ['@a/two'] })
    expect(
      directDependencies(spec, tarballs, new Map([['@a/two', new Set(['link:../two'])]])),
    ).toEqual({ kind: 'unpinned', names: ['@a/two'] })
  })
})

describe('the judgment of what was installed', () => {
  const policy = { profile: 'p', forbidden: [{ category: 'vendor-sdk', names: ['left-pad'] }] }
  const fixturePlan = { fixture: { role: 'caller' }, policy: withFixtureForbidden(policy, spec) }

  /** The calls that a judgment made to report, in order. */
  function judged(installed: readonly string[], plan: Parameters<typeof judgeInstalled>[1]) {
    const reported: [string, boolean, string][] = []
    const violations = judgeInstalled(installed, plan, '@m/member', (id, ok, detail) =>
      reported.push([id, ok, detail]),
    )
    return { reported, violations }
  }

  // Red when the check always passes: a package that only the install brought in, which the
  // declared closure does not list, is forbidden by the policy of the member.
  it('fails an installed package that the policy forbids although the declared closure has none', () => {
    const { reported, violations } = judged(['@a/one', 'left-pad'], { fixture: null, policy })
    expect(reported).toEqual([['forbidden-installed', false, 'left-pad (vendor-sdk)']])
    expect(violations).toEqual([
      { name: 'left-pad', category: 'vendor-sdk', via: ['@m/member', '...', 'left-pad'] },
    ])
  })

  // Red when the check leaves out the names that the fixture forbids on its own: only the overlay
  // of the fixture forbids `banned-x`, and the package is blamed on the fixture.
  it('fails an installed package that only the fixture forbids, attributed to the fixture', () => {
    const { reported, violations } = judged(['@a/one', 'banned-x'], fixturePlan)
    expect(reported).toEqual([['forbidden-installed', false, 'banned-x (fixture:caller)']])
    expect(violations).toEqual([
      { name: 'banned-x', category: 'fixture:caller', via: ['fixture:caller', '...', 'banned-x'] },
    ])
    expect(judged(['banned-x'], { fixture: null, policy }).reported[0]?.[1]).toBe(true)
  })

  // Red when a clean install is reported as a violation, or the check is not reported at all.
  it('reports one passing check for an install in which nothing is forbidden', () => {
    expect(judged(['@a/one', '@a/two'], fixturePlan)).toEqual({
      reported: [['forbidden-installed', true, 'none']],
      violations: [],
    })
  })
})

describe('fixtureClosure', () => {
  function member(name: string, dependencies: Record<string, string>): [string, string] {
    const directory = join(root, 'members', name.replace('/', '-'))
    write(join(directory, 'package.json'), JSON.stringify({ name, dependencies }))
    return [name, directory]
  }

  it('reaches only the closure of the declared packages, with the fixture at the head of every chain', () => {
    const members = new Map([
      member('@a/one', { '@a/shared': 'workspace:*', 'third-party': '1.0.0' }),
      member('@a/shared', {}),
      member('@a/unused', { 'unused-third-party': '1.0.0' }),
    ])
    const closure = fixtureClosure(
      { ...spec, dependencies: ['@a/one', 'direct-third-party'] },
      members,
    )
    expect(closure.workspace.map(item => [item.name, item.via])).toEqual([
      ['@a/one', ['fixture:caller', '@a/one']],
      ['@a/shared', ['fixture:caller', '@a/one', '@a/shared']],
    ])
    expect(closure.external.map(item => [item.name, item.via])).toEqual([
      ['third-party', ['fixture:caller', '@a/one', 'third-party']],
      ['direct-third-party', ['fixture:caller', 'direct-third-party']],
    ])
  })

  it('keeps the first chain of a package that two declared packages both reach', () => {
    const members = new Map([
      member('@a/first', { '@a/shared': 'workspace:*', 'both-reach': '1.0.0' }),
      member('@a/second', { '@a/shared': 'workspace:*', 'both-reach': '1.0.0' }),
      member('@a/shared', {}),
    ])
    const closure = fixtureClosure({ ...spec, dependencies: ['@a/first', '@a/second'] }, members)
    expect(closure.workspace.map(item => [item.name, item.via])).toEqual([
      ['@a/first', ['fixture:caller', '@a/first']],
      ['@a/shared', ['fixture:caller', '@a/first', '@a/shared']],
      ['@a/second', ['fixture:caller', '@a/second']],
    ])
    expect(closure.external.map(item => [item.name, item.via])).toEqual([
      ['both-reach', ['fixture:caller', '@a/first', 'both-reach']],
    ])
  })

  it('keeps the chain of a package that is declared and also reached through another one', () => {
    const members = new Map([member('@a/one', { 'third-party': '1.0.0' })])
    const closure = fixtureClosure({ ...spec, dependencies: ['@a/one', 'third-party'] }, members)
    expect(closure.external.map(item => [item.name, item.via])).toEqual([
      ['third-party', ['fixture:caller', '@a/one', 'third-party']],
    ])
  })
})

describe('the report of a fixture process', () => {
  const normal: PathResult = { name: 'works', kind: 'normal', ok: true }
  const failure: PathResult = {
    name: 'recovers',
    kind: 'failure',
    decision: 'retry later',
    ok: true,
  }

  it('passes a report that declares both paths, names the decision and has no broken path', () => {
    const checks = judgeOutcome({ role: 'caller', paths: [normal, failure] }, 'caller')
    expect(checks).toEqual([
      { id: 'fixture-report', ok: true, detail: '2 paths declared' },
      { id: 'fixture-paths', ok: true, detail: '2 paths passed' },
    ])
  })

  it('fails the report that has no failure path, with the runner wording, and still judges the paths', () => {
    const checks = judgeOutcome({ role: 'caller', paths: [normal] }, 'caller')
    expect(checks[0]).toEqual({
      id: 'fixture-report',
      ok: false,
      detail: 'fixture caller: no failure path declared',
    })
    expect(checks[1]?.ok).toBe(true)
  })

  it('fails the report whose failure path names no decision', () => {
    const { decision: _decision, ...bare } = failure
    const checks = judgeOutcome({ role: 'caller', paths: [normal, bare] }, 'caller')
    expect(checks[0]).toMatchObject({
      ok: false,
      detail: 'fixture caller: failure path recovers names no coordination decision',
    })
  })

  it('fails the report that has no normal path or repeats a path name', () => {
    const noNormal = judgeOutcome({ role: 'caller', paths: [failure] }, 'caller')
    expect(noNormal[0]?.detail).toBe('fixture caller: no normal path declared')
    const twice = judgeOutcome({ role: 'caller', paths: [normal, normal, failure] }, 'caller')
    expect(twice[0]?.detail).toBe('fixture caller: path name works is declared twice')
  })

  it('fails the report whose role is not the one of the manifest', () => {
    const checks = judgeOutcome({ role: 'other', paths: [normal, failure] }, 'caller')
    expect(checks[0]).toMatchObject({
      ok: false,
      detail: 'the fixture says its role is other, its manifest says caller',
    })
  })

  it('names each path that failed, with its error, apart from the declaration check', () => {
    const broken: PathResult = { name: 'breaks', kind: 'normal', ok: false, error: 'boom' }
    const unexplained: PathResult = { name: 'silent', kind: 'normal', ok: false }
    const checks = judgeOutcome({ role: 'caller', paths: [broken, unexplained, failure] }, 'caller')
    expect(checks[0]?.ok).toBe(true)
    expect(checks[1]).toEqual({
      id: 'fixture-paths',
      ok: false,
      detail: 'breaks: boom; silent: failed',
    })
  })

  function reportFile(name: string, text: string): string {
    return write(join(root, 'reports', name), text)
  }

  it('reads a report of the agreed shape', () => {
    const path = reportFile(
      'good.json',
      JSON.stringify({ role: 'caller', paths: [normal, failure] }),
    )
    expect(readOutcome(path)).toEqual({ role: 'caller', paths: [normal, failure] })
  })

  it('reads no report from a file that is missing, not JSON or of another shape', () => {
    expect(readOutcome(join(root, 'reports', 'absent.json'))).toBeNull()
    expect(readOutcome(reportFile('syntax.json', '{ nope'))).toBeNull()
    expect(readOutcome(reportFile('array.json', '[]'))).toBeNull()
    expect(readOutcome(reportFile('norole.json', '{"paths":[]}'))).toBeNull()
    expect(readOutcome(reportFile('nopaths.json', '{"role":"caller"}'))).toBeNull()
  })

  it('reads no report that has a path of the wrong shape', () => {
    const bad = (path: unknown) =>
      readOutcome(reportFile('bad.json', JSON.stringify({ role: 'caller', paths: [path] })))
    expect(bad({ name: 1, kind: 'normal', ok: true })).toBeNull()
    expect(bad({ name: 'p', kind: 'sideways', ok: true })).toBeNull()
    expect(bad({ name: 'p', kind: 'normal', ok: 'yes' })).toBeNull()
    expect(bad({ name: 'p', kind: 'failure', ok: true, decision: 3 })).toBeNull()
    expect(bad({ name: 'p', kind: 'normal', ok: false, error: 3 })).toBeNull()
    expect(bad('p')).toBeNull()
  })
})

describe('reading what the entries print', () => {
  const entry = {
    ok: false,
    checks: [{ id: 'fixture-dependencies', ok: false, detail: 'outside' }],
    forbidden: [{ name: 'x', category: 'c', via: ['m'] }],
    tarballs: [],
  }
  const summary = {
    role: 'caller',
    directory: '/d',
    ok: true,
    paths: [{ name: 'works', kind: 'normal', ok: true }],
    failedChecks: [],
  }
  const set = { member: '@m/one', ok: true, problems: [], fixtures: [summary] }

  // Red when a report of another shape is taken as a report: the specs would then read fields that
  // are not there and pass or fail for the wrong reason.
  it('reads a report of the agreed shape and names the field of one that is not', () => {
    expect(readEntryReport(JSON.stringify(entry))).toEqual(entry)
    for (const broken of [
      { ...entry, ok: 'yes' },
      { ...entry, checks: [{ id: 'a', ok: true }] },
      { ...entry, forbidden: [{ name: 'x' }] },
      { ...entry, tarballs: [{ name: 'x' }] },
      [],
    ])
      expect(() => readEntryReport(JSON.stringify(broken))).toThrow(/report/u)
  })

  it('reads a set report of the agreed shape and refuses one whose fixture lacks its paths', () => {
    expect(readSetReport(JSON.stringify(set))).toEqual(set)
    for (const broken of [
      { ...set, member: 1 },
      { ...set, problems: 'none' },
      { ...set, fixtures: [{ ...summary, paths: [{ name: 'works' }] }] },
      { ...set, fixtures: [{ ...summary, failedChecks: [{ id: 'a' }] }] },
    ])
      expect(() => readSetReport(JSON.stringify(broken))).toThrow(/set report/u)
  })
})

describe('the required check ids of a fixture run', () => {
  it('ask for the fixture checks in place of the probe, the scenario and the type check of the member', () => {
    const required = requiredCheckIds(['@m/one'], { fixture: true })
    expect(required).toEqual(
      expect.arrayContaining([
        'fixture-dependencies',
        'fixture-pins',
        'fixture-compile',
        'fixture-type-resolution-inside-consumer',
        'fixture-run',
        'fixture-resolution-inside-consumer',
        'fixture-resolution-no-source',
        'fixture-report',
        'fixture-paths',
        'forbidden-installed',
      ]),
    )
    for (const id of ['probe-run', 'type-check', 'scenario-run']) expect(required).not.toContain(id)
  })

  it('name a fixture check that a report leaves out', () => {
    const required = requiredCheckIds(['@m/one'], { fixture: true })
    const reported = required.filter(id => id !== 'fixture-paths').map(id => ({ id }))
    expect(missingCheckIds(reported, required)).toEqual(['fixture-paths'])
  })

  it('stay the member checks when no fixture is given', () => {
    const required = requiredCheckIds(['@m/one'])
    expect(required).toContain('probe-run')
    expect(required.some(id => id.startsWith('fixture-'))).toBe(false)
  })
})
