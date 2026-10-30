// 差分变异各测试文件共用的夹具：临时目录、带产品成员与工具成员的仓库、手写计划、起变异入口 CLI，
// 以及真起 Stryker 用的单成员夹具项目与 `mutate`。
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'
import type { PlanFile } from '../../src/testing/steps.ts'

export const CLI = fileURLToPath(new URL('../../src/mutation/cli.ts', import.meta.url))
const TS_CHECKS_MODULES = fileURLToPath(new URL('../../node_modules', import.meta.url))
const ROOT_TIERS = fileURLToPath(new URL('../../../../vitest.tiers.mts', import.meta.url))

// vitest 按文件隔离模块：每个测试文件各导入一份，清理挂在导入它的那个文件上。
const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})
export function temporary(prefix: string): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  temporaries.push(path)
  return path
}

/** 一个有产品成员和工具成员的仓库，已提交一次。 */
export function cliFixture(): string {
  const cliRoot = temporary('mutation-cli-')
  for (const path of ['packages/core/canary/src', 'tools/repo-toolchain'])
    mkdirSync(join(cliRoot, path), { recursive: true })
  writeFileSync(join(cliRoot, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n  - tools/*\n')
  for (const path of ['packages/core/canary', 'tools/repo-toolchain'])
    writeFileSync(
      join(cliRoot, path, 'package.json'),
      JSON.stringify({
        name: `@fixture/${path.split('/').at(-1)}`,
        scripts: { test: 'vitest run' },
      }),
    )
  writeFileSync(join(cliRoot, 'packages/core/canary/src/index.ts'), 'export const value = 1\n')
  execFileSync('git', ['init', '-q'], { cwd: cliRoot })
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ],
    { cwd: cliRoot },
  )
  return cliRoot
}

/** 写一份手写计划：基线引用 `ref`（缺省 HEAD），合并点 `mergeBase`，只选 `test` 里的成员。 */
export function writePlan(head: string, mergeBase: string, test: string[], ref = 'HEAD'): string {
  const path = join(temporary('mutation-plan-'), 'plan.json')
  const file = {
    head,
    dirty: true,
    base: { ref, mergeBase },
    plan: {
      mode: 'scoped',
      reason: '',
      files: [],
      members: [],
      build: [],
      typecheck: [],
      test,
      acceptance: [],
      python: { run: false, reason: '' },
    },
  } satisfies PlanFile
  writeFileSync(path, JSON.stringify(file))
  return path
}

export function cliAt(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args, '--root', root], {
    encoding: 'utf8',
  })
}

export const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** 一个只有一个成员的仓库：依赖链接到本次安装的包，编译器入口可随成员搬进 sandbox。 */
export function fixture(): { root: string; memberDir: string } {
  const root = temporary('mutation-e2e-')
  const memberDir = join(root, 'packages/core/sign')
  mkdirSync(join(memberDir, 'src'), { recursive: true })
  mkdirSync(join(memberDir, 'tests'))
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  // turbo 解析 workspace 时要求根清单写明包管理器，与真实仓库一致。
  writeFileSync(
    join(root, 'package.json'),
    '{ "name": "fixture-root", "private": true, "packageManager": "pnpm@10.28.1" }\n',
  )
  writeFileSync(join(root, '.gitignore'), 'node_modules\ndist\n.stryker-tmp*\n.turbo\n')
  copyFileSync(ROOT_TIERS, join(root, 'vitest.tiers.mts'))
  // 真构建出 dist：测试按包名导入自己时走的是它（sandbox 里由插过桩的 src 重新构建）。
  writeFileSync(
    join(memberDir, 'package.json'),
    JSON.stringify({
      name: '@fixture/sign',
      private: true,
      type: 'module',
      exports: { '.': './dist/sign.js' },
      scripts: {
        // pnpm 的 .bin shim 含相对路径，不能随 node_modules 软链接搬到夹具目录。
        build:
          'node node_modules/typescript/bin/tsc src/sign.ts --outDir dist --module nodenext --target es2022 --skipLibCheck',
        test: 'vitest run',
      },
    }),
  )
  writeFileSync(
    join(memberDir, 'vitest.config.ts'),
    [
      "import { testTiers } from '../../../vitest.tiers.mts'",
      "export default ({ mode }) => ({ test: { ...testTiers(mode), globals: true, include: ['tests/**/*.spec.ts'] } })",
    ].join('\n'),
  )
  // 慢层里一条必败的用例：变异只跑快层，它跑了初跑就失败、整次变异报错。
  writeFileSync(
    join(memberDir, 'tests/slow.spec.ts'),
    "test('slow only', { tags: ['slow'] }, () => { throw new Error('slow tier ran') })\n",
  )
  writeFileSync(join(memberDir, 'src/sign.ts'), 'export const zero = 0\n')
  writeFileSync(
    join(memberDir, 'tests/sign.spec.ts'),
    "import { zero } from '../src/sign.ts'\ntest('zero', () => { expect(zero).toBe(0) })\n",
  )
  const modules = join(memberDir, 'node_modules')
  mkdirSync(modules)
  for (const name of readdirSync(TS_CHECKS_MODULES)) {
    if (name.startsWith('.')) continue
    const source = join(TS_CHECKS_MODULES, name)
    const target = join(modules, name)
    if (name.startsWith('@')) {
      mkdirSync(target)
      for (const pkg of readdirSync(source))
        symlinkSync(realpathSync(join(source, pkg)), join(target, pkg), 'dir')
    } else symlinkSync(realpathSync(source), target, 'dir')
  }
  mkdirSync(join(modules, '.bin'))
  // pnpm 的 shim 按调用位置找编译器；Vitest 的类型检查须直接调用本次安装的入口。
  symlinkSync(
    realpathSync(join(TS_CHECKS_MODULES, 'typescript/bin/tsc')),
    join(modules, '.bin/tsc'),
    'file',
  )
  git(root, 'init', '--quiet')
  git(root, 'add', '.')
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base')
  return { root, memberDir }
}

/** 改动行：第 2 行是只在模块加载时求值的 static 变异体，没有断言守着；第 3～5 行由 sign 的断言守着。 */
export function staticFixture(): { root: string; memberDir: string } {
  const made = fixture()
  const { memberDir } = made
  writeFileSync(
    join(memberDir, 'src/sign.ts'),
    "export const zero = 0\nexport const LABEL = 'x'\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n",
  )
  writeFileSync(
    join(memberDir, 'tests/sign.spec.ts'),
    [
      "import { isPositive, LABEL, zero } from '../src/sign.ts'",
      "test('zero', () => { expect(zero).toBe(0) })",
      "test('sign', () => { expect(isPositive(1)).toBe(true); expect(isPositive(0)).toBe(false) })",
      "test('label is only read', () => { void LABEL })",
    ].join('\n'),
  )
  return made
}

/**
 * 夹具没有本仓库的影响面规则，现算不出计划：手写一份只选 `members` 的计划，走准入检查读计划的路径。
 * 增量快照缺省放进这次调用自己的临时目录（不在夹具仓库里，也不与别的调用共用），要复用上次的结果时由 `env` 给同一个目录。
 */
export function mutate(
  root: string,
  out: string,
  workers = '2',
  env: Record<string, string> = {},
  members: readonly string[] = ['packages/core/sign'],
  args: readonly string[] = [],
) {
  const head = git(root, 'rev-parse', 'HEAD').trim()
  const planPath = writePlan(head, head, [...members])
  const ran = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      CLI,
      'run',
      '--root',
      root,
      '--plan',
      planPath,
      '--out',
      out,
      ...args,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        BASELINE: undefined,
        VITEST_MAX_WORKERS: workers,
        OMNE_MUTATION_RECHECK_MAX: undefined,
        OMNE_MUTATION_INCREMENTAL: undefined,
        OMNE_MUTATION_PARALLEL: undefined,
        OMNE_MUTATION_INCREMENTAL_HOME: temporary('mutation-store-'),
        ...env,
      },
    },
  )
  const summary = existsSync(join(out, 'summary.json'))
    ? (JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as {
        members: {
          member: string
          counts: Record<string, number>
          valid: boolean
          score: number | null
          survived: { line: number }[]
          invalid: { line: number; reason: string }[]
          rechecked: { line: number; static: boolean; verdict: string }[]
          typeTests: Record<string, unknown> | null
          recheck: Record<string, unknown> | null
          outside: number
          unmutated: { file: string; start: number; end: number | null }[]
        }[]
        errors: string[]
        incremental?: {
          dir: string
          force: boolean
          members: { member: string; reused: number | null; notes: string[] }[]
        }
      })
    : undefined
  return { ran, summary }
}
