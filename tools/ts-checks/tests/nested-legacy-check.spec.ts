import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { typecheckMember } from '../src/testing/typecheck-member.ts'
import { runMembers } from '../src/testing/run.ts'
import { scopedProject } from '../src/testing/archive-project.ts'
import type { TestMember } from '../src/testing/members.ts'

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

it('filters direct nested compiler roots, preserves active errors and explicit imports', () => {
  const root = fixture()
  expect(typecheckMember(root)).toBe(0)
  put(root, 'src/live.ts', 'export const value: number = "bad"\n')
  expect(typecheckMember(root)).not.toBe(0)
  put(
    root,
    'src/live.ts',
    'import { poison } from "./archive.legacy/poison.js"\nexport { poison }\n',
  )
  expect(typecheckMember(root)).not.toBe(0)
  put(root, 'package.json', JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"' } }))
  expect(() => typecheckMember(root)).toThrow('Cannot exclude archived inputs')
}, 20_000)

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
    put(root, `src/${name}/old.legacy/poison.ts`, 'export const bad: string = 1\n')
    expect(typecheckMember(root)).toBe(0)
    put(root, `src/${name}/current.legacy-not/poison.ts`, 'export const bad: string = 1\n')
    expect(typecheckMember(root)).not.toBe(0)
  },
  20_000,
)

it('filters compiler roots discovered outside the member, without relying on an internal archive', () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  const archived = `${root}-shared.legacy`
  const active = `${root}-shared.legacy-not`
  roots.push(archived, active)
  put(archived, 'poison.ts', 'export const bad: string = 1\n')
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  config.include.push(`../${basename(archived)}/**/*.ts`)
  put(root, 'tsconfig.test.json', JSON.stringify(config))
  expect(typecheckMember(root)).toBe(0)
  put(active, 'poison.ts', 'export const bad: string = 1\n')
  config.include.push(`../${basename(active)}/**/*.ts`)
  put(root, 'tsconfig.test.json', JSON.stringify(config))
  expect(typecheckMember(root)).not.toBe(0)
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
    'all',
    () => {},
  )
  expect(result[0]?.exitCode, readFileSync(join(out, '..log'), 'utf8')).toBe(0)
}, 20_000)

it('a project without archived roots keeps its native build-info location', () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  config.compilerOptions.incremental = true
  put(root, 'tsconfig.test.json', JSON.stringify(config))
  expect(scopedProject(join(root, 'tsconfig.test.json'), join(root, 'overlay.json')).path).toBe(
    join(root, 'tsconfig.test.json'),
  )
  expect(typecheckMember(root)).toBe(0)
  expect(readFileSync(join(root, 'tsconfig.test.tsbuildinfo'), 'utf8')).not.toBe('')
}, 20_000)

it('accepts the native directory form of tsc --project without archives', () => {
  const root = fixture()
  rmSync(join(root, 'src/archive.legacy'), { recursive: true })
  put(root, 'tsconfig.json', readFileSync(join(root, 'tsconfig.test.json'), 'utf8'))
  put(root, 'package.json', JSON.stringify({ scripts: { typecheck: 'tsc -p .' } }))
  expect(typecheckMember(root)).toBe(0)
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
    'all',
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
      fileURLToPath(new URL('../src/testing/vitest-archive.ts', import.meta.url)),
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
        'all',
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
