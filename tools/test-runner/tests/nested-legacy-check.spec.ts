import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { checkTypecheckScopes, typecheckScopeProblem } from '../src/testing/typecheck-scope.ts'
import { runMembers } from '../src/testing/run.ts'
import {
  VITEST_ARCHIVE_ENTRY,
  scopedProject,
} from '@omne-harness/repo-toolchain/archive/archive-project'
import type { TestMember, WorkspaceMember } from '@omne-harness/repo-toolchain/core/workspace'

const TIER_DEFINITION = fileURLToPath(new URL('../../../vitest.tiers.mts', import.meta.url))

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'omne-nested-legacy-'))
  roots.push(root)
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true })
  for (const name of ['typescript', 'vitest'])
    symlinkSync(
      fileURLToPath(new URL(`../node_modules/${name}`, import.meta.url)),
      join(root, 'node_modules', name),
      'dir',
    )
  symlinkSync(
    fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    join(root, 'node_modules/.bin/tsc'),
  )
  symlinkSync(
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    join(root, 'node_modules/.bin/vitest'),
  )
  put(
    root,
    'package.json',
    JSON.stringify({
      name: '@fixture/nested',
      type: 'module',
      scripts: { typecheck: 'tsc -p tsconfig.test.json', test: 'vitest run' },
    }),
  )
  put(
    root,
    'tsconfig.test.json',
    JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        skipLibCheck: true,
      },
      include: ['src/**/*.ts', 'tests/**/*.ts'],
      exclude: ['tests/fixtures/**'],
    }),
  )
  put(root, 'src/live.ts', 'export const value: number = 1\n')
  put(root, 'src/archive.legacy/poison.ts', 'export const poison: string = 1\n')
  put(root, 'tests/fixtures/excluded.ts', 'export const poison: string = 1\n')
  return root
}

/** 成员的 tsconfig 在自己的 exclude 后面加上模板给的归档排除。 */
function excludeArchives(root: string): void {
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  config.exclude = [...(config.exclude ?? []), '**/*.legacy/**']
  put(root, 'tsconfig.test.json', JSON.stringify(config))
}
/** 成员的 typecheck 脚本由 turbo 原样运行；这里照样跑一次 tsc。 */
function tsc(root: string): number {
  return (
    spawnSync(join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.test.json'], { cwd: root })
      .status ?? 1
  )
}
function problem(root: string): string | undefined {
  const scratch = join(root, 'evidence')
  mkdirSync(scratch, { recursive: true })
  return typecheckScopeProblem(root, scratch)
}

it('reports archived compiler roots that the member configuration does not exclude', () => {
  const root = fixture()
  expect(problem(root)).toContain('Archived files are compiler roots')
  excludeArchives(root)
  expect(problem(root)).toBeUndefined()
  expect(tsc(root)).toBe(0)
  put(root, 'src/live.ts', 'export const value: number = "bad"\n')
  expect(tsc(root)).not.toBe(0)
  put(
    root,
    'src/live.ts',
    'import { poison } from "./archive.legacy/poison.js"\nexport { poison }\n',
  )
  expect(tsc(root)).not.toBe(0)
  put(root, 'package.json', JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"' } }))
  expect(problem(root)).toContain('Cannot exclude archived inputs')
}, 20_000)

it('checkTypecheckScopes names every member with a problem and runs nothing', () => {
  const root = fixture()
  const member: WorkspaceMember = {
    path: '.',
    name: '@fixture/nested',
    scripts: {},
    dependencies: [],
  }
  expect(() => checkTypecheckScopes(root, [member])).toThrow(
    /^\.: Archived files are compiler roots/u,
  )
  excludeArchives(root)
  expect(() => checkTypecheckScopes(root, [member])).not.toThrow()
})

it('preserves project references and existing exclusions in the generated project', () => {
  const root = fixture()
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  config.references = [{ path: './dependency' }]
  put(root, 'tsconfig.test.json', JSON.stringify(config))
  const scoped = scopedProject(
    join(root, 'tsconfig.test.json'),
    join(root, 'evidence/project.json'),
  )
  const output = JSON.parse(readFileSync(scoped.path, 'utf8'))
  expect(output.files).toEqual([join(root, 'src/live.ts')])
  expect(output.include).toEqual([])
  expect(output.references).toEqual([{ path: join(root, 'dependency') }])
})

it.each(['generated', 'tmp', 'dist', 'coverage'])(
  'a source folder named %s still excludes its archived descendants',
  name => {
    const root = fixture()
    rmSync(join(root, 'src/archive.legacy'), { recursive: true })
    excludeArchives(root)
    put(root, `src/${name}/old.legacy/poison.ts`, 'export const bad: string = 1\n')
    expect(problem(root)).toBeUndefined()
    expect(tsc(root)).toBe(0)
    put(root, `src/${name}/current.legacy-not/poison.ts`, 'export const bad: string = 1\n')
    expect(tsc(root)).not.toBe(0)
  },
  20_000,
)

it('reports archived compiler roots outside the member, which a member glob cannot exclude', () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  excludeArchives(root)
  const archived = `${root}-shared.legacy`
  roots.push(archived)
  put(archived, 'poison.ts', 'export const bad: string = 1\n')
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  config.include.push(`../${basename(archived)}/**/*.ts`)
  put(root, 'tsconfig.test.json', JSON.stringify(config))
  expect(problem(root)).toContain('Archived files are compiler roots')
}, 20_000)

it('real Vitest filters external compiler roots without an internal archive trigger', async () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  const archived = `${root}-shared.legacy`
  roots.push(archived)
  put(archived, 'poison.ts', 'export const bad: string = 1\n')
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  config.include.push(`../${basename(archived)}/**/*.ts`)
  put(root, 'tsconfig.test.json', JSON.stringify(config))
  put(
    root,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['tests/**/*.spec.ts'], typecheck: { enabled: true, include: ['tests/**/*.spec-d.ts'], tsconfig: './tsconfig.test.json' } } })\n`,
  )
  put(
    root,
    'tests/live.spec.ts',
    `import { test, expect } from 'vitest'\ntest('live', () => expect(1).toBe(1))\n`,
  )
  put(
    root,
    'tests/live.spec-d.ts',
    `import { test, expectTypeOf } from 'vitest'\ntest('live type', () => expectTypeOf(1).toBeNumber())\n`,
  )
  const target: TestMember = {
    path: '.',
    name: '@fixture/nested',
    script: 'vitest run',
    dependencies: [],
  }
  const out = join(root, 'evidence')
  mkdirSync(out)
  const result = await runMembers(
    root,
    [target],
    out,
    { memberConcurrency: 1, vitestMaxWorkers: 1 },
    'test',
    () => {},
  )
  expect(result[0]?.exitCode, readFileSync(join(out, '..log'), 'utf8')).toBe(0)
}, 20_000)

it('a project without archived roots keeps its native configuration', () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  config.compilerOptions.incremental = true
  put(root, 'tsconfig.test.json', JSON.stringify(config))
  expect(scopedProject(join(root, 'tsconfig.test.json'), join(root, 'overlay.json')).path).toBe(
    join(root, 'tsconfig.test.json'),
  )
  expect(problem(root)).toBeUndefined()
}, 20_000)

it('accepts the native directory form of tsc --project without archives', () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  put(root, 'tsconfig.json', readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  put(root, 'package.json', JSON.stringify({ scripts: { typecheck: 'tsc -p .' } }))
  expect(problem(root)).toBeUndefined()
}, 20_000)

it('keeps a native Vitest projects configuration when there are no archived inputs', async () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  put(
    root,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { projects: [{ test: { name: 'unit', include: ['tests/**/*.spec.ts'] } }] } })\n`,
  )
  put(
    root,
    'tests/live.spec.ts',
    `import { test, expect } from 'vitest'\ntest('live', () => expect(1).toBe(1))\n`,
  )
  const target: TestMember = {
    path: '.',
    name: '@fixture/nested',
    script: 'vitest run',
    dependencies: [],
  }
  const out = join(root, 'evidence')
  mkdirSync(out)
  const result = await runMembers(
    root,
    [target],
    out,
    { memberConcurrency: 1, vitestMaxWorkers: 1 },
    'test',
    () => {},
  )
  expect(result[0]?.exitCode, readFileSync(join(out, '..log'), 'utf8')).toBe(0)
}, 20_000)

it('preserves a single native CLI exclusion as a whole pattern', () => {
  const root = fixture()
  const output = join(root, 'options.json')
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      VITEST_ARCHIVE_ENTRY,
      'vitest run --typecheck.exclude tests/fixtures/**',
      'all',
      output,
    ],
    { cwd: root, encoding: 'utf8' },
  )
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual([
    '--typecheck.exclude',
    'tests/fixtures/**',
    '--typecheck.exclude',
    '**/*.legacy/**',
  ])
}, 20_000)

it('filters external archived runtime tests and preserves external active failures', async () => {
  const root = fixture()
  const shared = root + '-shared.legacy'
  const active = shared + '-not'
  roots.push(shared, active)
  put(shared, 'poison[1].spec.ts', `throw new Error('EXTERNAL_ARCHIVE_EXECUTED')\n`)
  put(
    root,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['tests/**/*.spec.ts', '../${basename(root)}-shared*/**/*.spec.ts'] } })\n`,
  )
  put(
    root,
    'tests/live.spec.ts',
    `import { test, expect } from 'vitest'\ntest('live', () => expect(1).toBe(1))\n`,
  )
  const target: TestMember = {
    path: '.',
    name: '@fixture/nested',
    script: 'vitest run',
    dependencies: [],
  }
  const run = async (name: string) => {
    const out = join(root, 'evidence', name)
    mkdirSync(out, { recursive: true })
    return (
      await runMembers(
        root,
        [target],
        out,
        { memberConcurrency: 1, vitestMaxWorkers: 1 },
        'test',
        () => {},
      )
    )[0]
  }
  const passed = await run('pass')
  expect(passed?.exitCode, readFileSync(join(root, 'evidence/pass/..log'), 'utf8')).toBe(0)
  expect(passed?.report?.testResults.map(result => result.name)).toEqual([
    join(root, 'tests/live.spec.ts'),
  ])
  put(
    active,
    'error.spec.ts',
    `import { test, expect } from 'vitest'\ntest('external active error', () => expect(1).toBe(2))\n`,
  )
  const failed = await run('fail')
  expect(failed?.exitCode).not.toBe(0)
  expect(readFileSync(join(root, 'evidence/fail/..log'), 'utf8')).toContain('external active error')
}, 30_000)

it('real Vitest ignores archived runtime/type roots while active source errors still fail', async () => {
  const root = fixture()
  put(
    root,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['tests/**/*.spec.ts'], exclude: ['tests/fixtures/**'], typecheck: { enabled: true, include: ['tests/**/*.spec-d.ts'], exclude: ['tests/fixtures/**'], tsconfig: './tsconfig.test.json' } } })\n`,
  )
  put(
    root,
    'tests/live.spec.ts',
    `import { test, expect } from 'vitest'\ntest('live', () => expect(1).toBe(1))\n`,
  )
  put(
    root,
    'tests/live.spec-d.ts',
    `import { test, expectTypeOf } from 'vitest'\ntest('live type', () => expectTypeOf(1).toBeNumber())\n`,
  )
  put(root, 'tests/archive.legacy/poison.spec.ts', `throw new Error('archived runtime ran')\n`)
  put(root, 'tests/archive.legacy/poison.spec-d.ts', `export const bad: string = 1\n`)
  put(root, 'tests/fixtures/excluded.spec-d.ts', `export const bad: string = 1\n`)
  const target: TestMember = {
    path: '.',
    name: '@fixture/nested',
    script: 'vitest run',
    dependencies: [],
  }
  const run = async (name: string) => {
    const out = join(root, 'evidence', name)
    mkdirSync(out, { recursive: true })
    return (
      await runMembers(
        root,
        [target],
        out,
        { memberConcurrency: 1, vitestMaxWorkers: 1 },
        'test',
        () => {},
      )
    )[0]
  }
  const passed = await run('pass')
  expect(passed?.exitCode, readFileSync(join(root, 'evidence/pass/..log'), 'utf8')).toBe(0)
  expect(passed?.report?.testResults.map(result => result.name).join('\n')).not.toContain(
    '.legacy/',
  )
  put(root, 'src/live.ts', 'export const value: number = "active error"\n')
  const failed = await run('fail')
  expect(failed?.exitCode).not.toBe(0)
}, 30_000)

it('the shared tier configuration keeps archived runtime and type tests out of a real Vitest run', () => {
  const root = fixture()
  excludeArchives(root)
  const config = (spread: boolean) =>
    [
      "import { defineConfig } from 'vitest/config'",
      `import { testTiers } from ${JSON.stringify(TIER_DEFINITION)}`,
      'export default defineConfig(({ mode }) => {',
      `  const tiers = ${spread ? 'testTiers(mode)' : '{ typecheck: {} }'}`,
      "  return { test: { ...tiers, include: ['tests/**/*.spec.ts'], typecheck: { ...tiers.typecheck, enabled: true, include: ['tests/**/*.spec-d.ts'], tsconfig: './tsconfig.test.json' } } }",
      '})',
      '',
    ].join('\n')
  put(
    root,
    'tests/live.spec.ts',
    `import { test, expect } from 'vitest'\ntest('live', () => expect(1).toBe(1))\n`,
  )
  put(
    root,
    'tests/live.spec-d.ts',
    `import { test, expectTypeOf } from 'vitest'\ntest('live type', () => expectTypeOf(1).toBeNumber())\n`,
  )
  put(root, 'tests/archive.legacy/poison.spec.ts', `throw new Error('archived runtime ran')\n`)
  put(
    root,
    'tests/archive.legacy/poison.spec-d.ts',
    `import { test, expectTypeOf } from 'vitest'\ntest('archived type', () => expectTypeOf(1).toBeString())\n`,
  )
  const vitest = (spread: boolean) => {
    put(root, 'vitest.config.ts', config(spread))
    const report = join(root, `report-${spread}.json`)
    // 不把运行器的报告目录传给夹具。
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env['OMNE_TEST_REPORT_DIR']
    const ran = spawnSync(
      join(root, 'node_modules/.bin/vitest'),
      ['run', '--reporter=json', `--outputFile.json=${report}`],
      { cwd: root, encoding: 'utf8', env },
    )
    return { ran, report: readFileSync(report, 'utf8') }
  }
  const kept = vitest(true)
  expect(kept.ran.status, `${kept.ran.stdout}${kept.ran.stderr}`).toBe(0)
  expect(kept.report).toContain('live.spec.ts')
  expect(kept.report).not.toContain('.legacy/')
  // 不展开分层定义时同一批归档测试会跑：上面的通过靠的是它的排除。
  const unfiltered = vitest(false)
  expect(unfiltered.ran.status).not.toBe(0)
  expect(unfiltered.report).toContain('archive.legacy/poison.spec')
}, 30_000)
