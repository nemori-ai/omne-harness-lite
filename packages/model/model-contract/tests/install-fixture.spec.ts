// @module-tag slow
// Runs the fixture steps of the facility where they must refuse: node, the TypeScript compiler and
// the entry points start as child processes. The project directories are built by hand, so no pack
// or install is needed; the cases that go through the CLI fail before anything is packed. The
// pure judgments are in install-fixture-judgment.spec.ts.
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { readEntryReport, readSetReport, type EntryReport } from './install-reports.ts'
import {
  compileFixture,
  copyFixture,
  FIXTURE_RUN_LIMIT_MS,
  runFixture,
} from './install/fixture-run.ts'
import { exec } from './install/process.ts'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = join(packageDirectory, '..', '..', '..')
const template = join(packageDirectory, 'tests/fixtures/consumers/independent-caller/tsconfig.json')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'install-fixture-')))
const workDirectory = join(workspaceRoot, 'tmp/install-closure/model-contract-fixture-spec')
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(workDirectory, { recursive: true, force: true })
})

function write(path: string, text: string): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return path
}

/** A consumer project that has one installed package, `inner`, with its declarations. */
function consumer(name: string): { base: string; project: string } {
  const base = join(root, name)
  const project = join(base, 'project')
  const inner = join(project, 'node_modules/inner')
  write(join(project, 'package.json'), '{"name":"consumer","private":true,"type":"module"}')
  write(
    join(inner, 'package.json'),
    '{"name":"inner","version":"1.0.0","type":"module","exports":{".":{"types":"./index.d.ts","import":"./index.js"}}}',
  )
  write(join(inner, 'index.js'), 'export const answer = 42\n')
  write(join(inner, 'index.d.ts'), 'export declare const answer: 42\n')
  return { base, project }
}

/** A fixture directory that has the real compiler settings and the given source. */
function fixtureSource(base: string, source: string): string {
  const directory = join(base, 'fixture-source')
  mkdirSync(directory, { recursive: true })
  copyFileSync(template, join(directory, 'tsconfig.json'))
  write(join(directory, 'fixture.ts'), source)
  return directory
}

const callerSource = [
  "import { answer } from 'inner'",
  'export const fixture = {',
  "  role: 'caller',",
  '  paths: [',
  "    { name: 'works', kind: 'normal', run: async () => { if (answer !== 42) throw new Error('wrong') } },",
  "    { name: 'recovers', kind: 'failure', decision: 'retry later', run: async () => {} },",
  '  ],',
  '}',
  '',
].join('\n')

describe('compileFixture', () => {
  it('compiles a fixture against the installed packages and loads only files inside the consumer', () => {
    const { base, project } = consumer('compile-ok')
    copyFixture({ project, directory: fixtureSource(base, callerSource) })
    const { files, checks } = compileFixture(project)
    expect(checks).toEqual([
      { id: 'fixture-compile', ok: true, detail: expect.any(String) },
      { id: 'fixture-type-resolution-inside-consumer', ok: true, detail: `${files} files` },
    ])
    expect(files).toBeGreaterThan(1)
    expect(existsSync(join(project, 'fixture-out/fixture.js'))).toBe(true)
  })

  it('fails a fixture that imports a package it did not declare, and names the error', () => {
    const { base, project } = consumer('compile-undeclared')
    copyFixture({
      project,
      directory: fixtureSource(base, "import { x } from 'undeclared'\nexport const fixture = x\n"),
    })
    const { checks } = compileFixture(project)
    expect(checks).toEqual([
      { id: 'fixture-compile', ok: false, detail: expect.stringContaining('TS2307') },
    ])
  })

  it('fails a fixture that does not type-check against the installed declarations', () => {
    const { base, project } = consumer('compile-types')
    copyFixture({
      project,
      directory: fixtureSource(
        base,
        "import { answer } from 'inner'\nexport const fixture: 41 = answer\n",
      ),
    })
    expect(compileFixture(project).checks[0]).toMatchObject({
      id: 'fixture-compile',
      ok: false,
      detail: expect.stringContaining('TS2322'),
    })
  })

  it('fails the type resolution when only a directory above the consumer answers an import', () => {
    const { base, project } = consumer('compile-ancestor')
    const above = join(base, 'node_modules/ancestor')
    write(join(above, 'package.json'), '{"name":"ancestor","version":"1.0.0","types":"index.d.ts"}')
    write(join(above, 'index.d.ts'), 'export declare const above: 1\n')
    copyFixture({
      project,
      directory: fixtureSource(
        base,
        "import { above } from 'ancestor'\nexport const fixture = above\n",
      ),
    })
    const { checks } = compileFixture(project)
    expect(checks[0]).toMatchObject({ id: 'fixture-compile', ok: true })
    expect(checks[1]).toMatchObject({
      id: 'fixture-type-resolution-inside-consumer',
      ok: false,
      detail: expect.stringContaining('ancestor'),
    })
  })

  it('copies only the TypeScript files and the compiler settings of the fixture', () => {
    const { base, project } = consumer('copy')
    const directory = fixtureSource(base, callerSource)
    write(join(directory, 'values.ts'), 'export const value = 1\n')
    write(join(directory, 'fixture.json'), '{}')
    write(join(directory, 'notes.md'), 'notes')
    mkdirSync(join(directory, 'nested'))
    write(join(directory, 'nested/deep.ts'), 'export const deep = 1\n')
    copyFixture({ project, directory })
    const copied = ['fixture.ts', 'tsconfig.json', 'values.ts'].filter(file =>
      existsSync(join(project, 'fixture', file)),
    )
    expect(copied).toEqual(['fixture.ts', 'tsconfig.json', 'values.ts'])
    for (const file of ['fixture.json', 'notes.md', 'nested'])
      expect(existsSync(join(project, 'fixture', file))).toBe(false)
  })
})

/** A project whose compiled fixture is the given JavaScript, run with the facility's own host. */
function compiled(name: string, source: string): string {
  const { project } = consumer(name)
  write(join(project, 'fixture-out/fixture.js'), source)
  return project
}

const ids = (checks: readonly { id: string; ok: boolean }[]) =>
  checks.map(check => `${check.id}:${check.ok ? 'ok' : 'fail'}`)

const passingFixture = [
  "import { answer } from 'inner'",
  'export const fixture = {',
  "  role: 'caller',",
  '  paths: [',
  "    { name: 'works', kind: 'normal', run: async () => { if (answer !== 42) throw new Error('wrong') } },",
  "    { name: 'recovers', kind: 'failure', decision: 'retry later', run: async () => {} },",
  '  ],',
  '}',
  '',
].join('\n')

describe('runFixture', () => {
  it('runs the paths in the consumer directory and reports each of them', () => {
    const project = compiled('run-ok', passingFixture)
    const { outcome, checks } = runFixture({ project, expectedRole: 'caller' })
    expect(ids(checks)).toEqual([
      'fixture-run:ok',
      'fixture-resolution-inside-consumer:ok',
      'fixture-resolution-no-source:ok',
      'fixture-report:ok',
      'fixture-paths:ok',
    ])
    expect(outcome).toEqual({
      role: 'caller',
      paths: [
        { name: 'works', kind: 'normal', ok: true },
        { name: 'recovers', kind: 'failure', decision: 'retry later', ok: true },
      ],
    })
  })

  it('fails a fixture that declares no failure path, and still runs the path it has', () => {
    const project = compiled(
      'run-no-failure',
      "export const fixture = { role: 'caller', paths: [{ name: 'works', kind: 'normal', run: async () => {} }] }\n",
    )
    const { checks } = runFixture({ project, expectedRole: 'caller' })
    expect(checks.find(check => check.id === 'fixture-report')).toEqual({
      id: 'fixture-report',
      ok: false,
      detail: 'fixture caller: no failure path declared',
    })
    expect(checks.find(check => check.id === 'fixture-paths')?.ok).toBe(true)
  })

  it('fails a fixture whose failure path names no decision', () => {
    const project = compiled(
      'run-no-decision',
      [
        'export const fixture = { role: "caller", paths: [',
        '  { name: "works", kind: "normal", run: async () => {} },',
        '  { name: "recovers", kind: "failure", run: async () => {} },',
        '] }',
      ].join('\n'),
    )
    const { checks } = runFixture({ project, expectedRole: 'caller' })
    expect(checks.find(check => check.id === 'fixture-report')?.detail).toBe(
      'fixture caller: failure path recovers names no coordination decision',
    )
  })

  it('reports a path that throws with its message and still runs the paths after it', () => {
    const project = compiled(
      'run-throws',
      [
        'export const fixture = { role: "caller", paths: [',
        '  { name: "breaks", kind: "normal", run: async () => { throw new Error("the observer closed early") } },',
        '  { name: "recovers", kind: "failure", decision: "retry", run: async () => {} },',
        '] }',
      ].join('\n'),
    )
    const { outcome, checks } = runFixture({ project, expectedRole: 'caller' })
    expect(checks.find(check => check.id === 'fixture-paths')).toEqual({
      id: 'fixture-paths',
      ok: false,
      detail: 'breaks: the observer closed early',
    })
    expect(outcome?.paths.map(path => [path.name, path.ok])).toEqual([
      ['breaks', false],
      ['recovers', true],
    ])
  })

  it('fails a fixture that resolves something outside the consumer directory, though every path passed', () => {
    const project = compiled(
      'run-outside',
      [
        "import { outside } from '../../outside.mjs'",
        'export const fixture = { role: "caller", paths: [',
        '  { name: "works", kind: "normal", run: async () => { if (outside !== 1) throw new Error("x") } },',
        '  { name: "recovers", kind: "failure", decision: "retry", run: async () => {} },',
        '] }',
      ].join('\n'),
    )
    write(join(project, '../outside.mjs'), 'export const outside = 1\n')
    const { checks } = runFixture({ project, expectedRole: 'caller' })
    expect(checks.find(check => check.id === 'fixture-paths')?.ok).toBe(true)
    const verdict = checks.find(check => check.id === 'fixture-resolution-inside-consumer')
    expect(verdict?.ok).toBe(false)
    expect(verdict?.detail).toContain('outside.mjs')
  })

  it('fails a fixture that resolves a source file inside the consumer directory', () => {
    const project = compiled(
      'run-source',
      [
        "import { value } from '../src/value.mjs'",
        'export const fixture = { role: "caller", paths: [',
        '  { name: "works", kind: "normal", run: async () => { if (value !== 1) throw new Error("x") } },',
        '  { name: "recovers", kind: "failure", decision: "retry", run: async () => {} },',
        '] }',
      ].join('\n'),
    )
    write(join(project, 'src/value.mjs'), 'export const value = 1\n')
    const verdict = runFixture({ project, expectedRole: 'caller' }).checks.find(
      check => check.id === 'fixture-resolution-no-source',
    )
    expect(verdict?.ok).toBe(false)
    expect(verdict?.detail).toContain('value.mjs')
  })

  it('fails a fixture whose role is not the one of its manifest', () => {
    const { checks } = runFixture({
      project: compiled('run-role', passingFixture),
      expectedRole: 'another-role',
    })
    expect(checks.find(check => check.id === 'fixture-report')?.detail).toBe(
      'the fixture says its role is caller, its manifest says another-role',
    )
  })

  it('fails when the fixture does not export the expected shape, and says so', () => {
    const { outcome, checks } = runFixture({
      project: compiled('run-shape', 'export const fixture = 1\n'),
      expectedRole: 'caller',
    })
    expect(outcome).toBeNull()
    expect(checks).toEqual([
      {
        id: 'fixture-run',
        ok: false,
        detail: expect.stringContaining('fixture.ts must export `fixture`'),
      },
    ])
  })

  it('fails when a path has no run function', () => {
    const project = compiled(
      'run-norun',
      'export const fixture = { role: "caller", paths: [{ name: "idle", kind: "normal" }] }\n',
    )
    expect(runFixture({ project, expectedRole: 'caller' }).checks).toEqual([
      {
        id: 'fixture-run',
        ok: false,
        detail: expect.stringContaining('the path idle has no run function'),
      },
    ])
  })

  it('fails with the error line when the fixture cannot even be imported', () => {
    const project = compiled('run-import', "import 'not-installed'\nexport const fixture = 1\n")
    const [check] = runFixture({ project, expectedRole: 'caller' }).checks
    expect(check?.ok).toBe(false)
    expect(check?.detail).toMatch(/^exit 1: Error/u)
    expect(check?.detail).toContain('not-installed')
  })

  // Red when the time limit is not enforced. The path ends of itself after 20 s, so a limit that is
  // ignored makes `fixture-run` pass and this case fail, where a path that never ended would hold
  // the worker for ever.
  it('kills a fixture whose path does not settle in time, at the time limit', () => {
    const project = compiled(
      'run-hang',
      [
        'export const fixture = { role: "caller", paths: [',
        '  { name: "hangs", kind: "normal", run: () => new Promise(resolve => { setTimeout(resolve, 20000) }) },',
        '] }',
      ].join('\n'),
    )
    const [check] = runFixture({ project, expectedRole: 'caller', limitMs: 1500 }).checks
    expect(check).toMatchObject({ id: 'fixture-run', ok: false })
    expect(check?.detail).toMatch(/^killed by SIGTERM/u)
  })

  // Red when the default limit is dropped or replaced: a run that is given no limit must start the
  // process with the exported default, and a run that is given one with that one.
  it('starts the process with the default time limit unless the caller gives another', () => {
    const limits: (number | undefined)[] = []
    const spy: typeof exec = (_command, _args, _cwd, _extra, timeoutMs) => {
      limits.push(timeoutMs)
      return { status: 1, signal: null, stdout: '', stderr: '' }
    }
    const project = compiled('run-limit', passingFixture)
    runFixture({ project, expectedRole: 'caller', execute: spy })
    runFixture({ project, expectedRole: 'caller', limitMs: 1234, execute: spy })
    expect(limits).toEqual([FIXTURE_RUN_LIMIT_MS, 1234])
    expect(FIXTURE_RUN_LIMIT_MS).toBeGreaterThan(0)
  })
})

describe('exec', () => {
  // Red when the time limit is ignored: the child sleeps 20 s and is killed after 0.5 s, so a
  // limit that does nothing shows up as a finished child, in 20 s, not as a worker that never returns.
  it('kills a child that outlives its time limit and says which signal', () => {
    const started = Date.now()
    const result = exec(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 20000)'],
      root,
      undefined,
      500,
    )
    expect(result.signal).toBe('SIGTERM')
    expect(Date.now() - started).toBeLessThan(15_000)
  })
})

/** The vitest bin shim sets NODE_PATH, and a developer shell may allow the network: strip both. */
function cleanEnv(): NodeJS.ProcessEnv {
  const { NODE_PATH: _path, OMNE_INSTALL_ALLOW_NETWORK: _network, ...rest } = process.env
  return rest
}

/** The entries that refuse a fixture return in seconds; a hung one fails the case, not the suite. */
const ENTRY_LIMIT_MS = 100_000

function runEntry(entry: string, args: readonly string[]) {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      join(packageDirectory, 'tests/install', entry),
      '--member',
      packageDirectory,
      '--workspace-root',
      workspaceRoot,
      ...args,
    ],
    { encoding: 'utf8', env: cleanEnv(), timeout: ENTRY_LIMIT_MS },
  )
  if (result.status === null)
    throw new Error(`${entry} did not finish within ${ENTRY_LIMIT_MS} ms: ${result.signal}`)
  return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

/** A fixture directory with the given declarations, ready to hand to the CLI. */
function declared(name: string, declarations: Record<string, unknown>): string {
  const directory = join(root, 'declared', name)
  mkdirSync(directory, { recursive: true })
  copyFileSync(template, join(directory, 'tsconfig.json'))
  write(join(directory, 'fixture.ts'), 'export const fixture = 1\n')
  write(join(directory, 'fixture.json'), JSON.stringify(declarations))
  return directory
}

const check = (report: EntryReport, id: string) => report.checks.find(item => item.id === id)

describe('install-closure CLI refuses a fixture before it packs anything', () => {
  it('fails a fixture that declares a package outside the closure of the member and names it', () => {
    const fixture = declared('outside', {
      role: 'outside',
      dependencies: ['left-pad', '@omne-harness/model-contract'],
    })
    const run = runEntry('cli.ts', ['--fixture', fixture, '--work-dir', workDirectory])
    const report = readEntryReport(run.stdout)
    expect(run.status).toBe(1)
    expect(check(report, 'fixture-dependencies')).toMatchObject({
      ok: false,
      detail: 'outside the closure of @omne-harness/model-contract: left-pad',
    })
    expect(report.tarballs).toEqual([])
  })

  it('fails a fixture that forbids a package that it reaches, and names it with the fixture category', () => {
    const fixture = declared('forbids', {
      role: 'forbids',
      dependencies: ['@omne-harness/model-contract'],
      forbidden: ['@omne-harness/legal-identity'],
    })
    const run = runEntry('cli.ts', ['--fixture', fixture, '--work-dir', workDirectory])
    const report = readEntryReport(run.stdout)
    expect(run.status).toBe(1)
    expect(report.forbidden).toContainEqual({
      name: '@omne-harness/legal-identity',
      category: 'fixture:forbids',
      via: ['fixture:forbids', '@omne-harness/model-contract', '@omne-harness/legal-identity'],
    })
    expect(check(report, 'forbidden-declared')?.ok).toBe(false)
    expect(report.tarballs).toEqual([])
  })

  it('fails a fixture directory that lacks the files of a fixture', () => {
    const empty = join(root, 'declared', 'empty')
    mkdirSync(empty, { recursive: true })
    const run = runEntry('cli.ts', ['--fixture', empty, '--work-dir', workDirectory])
    const report = readEntryReport(run.stdout)
    expect(run.status).toBe(1)
    expect(check(report, 'fixture-dependencies')).toMatchObject({
      ok: false,
      detail: expect.stringContaining('lacks fixture.json, tsconfig.json, fixture.ts'),
    })
  })

  it('refuses a fixture together with a scenario, and a fixture directory that does not exist', () => {
    const fixture = declared('both', {
      role: 'both',
      dependencies: ['@omne-harness/model-contract'],
    })
    const script = write(join(root, 'scenario.mjs'), '')
    const both = runEntry('cli.ts', ['--fixture', fixture, '--scenario', script])
    expect(both.status).toBe(2)
    expect(both.stderr).toContain('--scenario and --fixture cannot be combined')
    const absent = runEntry('cli.ts', ['--fixture', join(root, 'declared', 'absent')])
    expect(absent.status).toBe(2)
    expect(absent.stderr).toContain('fixture directory not found')
  })
})

describe('the fixtures entry refuses a set that is not whole', () => {
  it('fails when a required role has no fixture and runs nothing', () => {
    const consumers = join(root, 'consumers-missing')
    write(join(consumers, 'roles.json'), '{"roles":["caller"]}')
    const run = runEntry('fixtures.ts', ['--consumers', consumers])
    const report = readSetReport(run.stdout)
    expect(run.status).toBe(1)
    expect(report.ok).toBe(false)
    expect(report.problems).toEqual(['fixture caller: required role has no fixture'])
    expect(report.fixtures).toEqual([])
  })

  it('fails a fixture of the set that the closure check refuses, and reports its failed check', () => {
    const consumers = join(root, 'consumers-bad')
    write(join(consumers, 'roles.json'), '{"roles":["outside"]}')
    const outside = join(consumers, 'outside')
    mkdirSync(outside, { recursive: true })
    copyFileSync(template, join(outside, 'tsconfig.json'))
    write(join(outside, 'fixture.ts'), 'export const fixture = 1\n')
    write(
      join(outside, 'fixture.json'),
      JSON.stringify({ role: 'outside', dependencies: ['left-pad'] }),
    )
    const run = runEntry('fixtures.ts', ['--consumers', consumers])
    const report = readSetReport(run.stdout)
    expect(run.status).toBe(1)
    expect(report.fixtures).toMatchObject([
      { role: 'outside', ok: false, paths: [], failedChecks: [{ id: 'fixture-dependencies' }] },
    ])
  })

  it('exits with a usage error for an argument that it cannot read', () => {
    const run = runEntry('fixtures.ts', ['--bogus'])
    expect(run.status).toBe(2)
    expect(run.stderr).toContain('cannot read arguments')
  })
})
