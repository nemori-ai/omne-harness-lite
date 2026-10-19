// 差分变异：范围（改动行 → 各成员的 mutate 条目）、报告汇总、sandbox 的位置、入口的参数，
// 以及一个小夹具项目上真起 Stryker：没断言的测试留下存活变异体，补上断言后被杀。
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parseDiff } from '@omne-harness/repo-toolchain/core/git'
import {
  memberLines,
  notRunError,
  summarizeMember,
  type MutationReport,
} from '../src/mutation/report.ts'
import {
  changedTargets,
  memberTargets,
  mutateEntries,
  type MutationTarget,
} from '../src/mutation/scope.ts'
import { sandboxContainer, strykerConfig } from '../src/mutation/stryker.ts'
import type { PlanFile } from '../src/testing/steps.ts'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'

const CLI = fileURLToPath(new URL('../src/mutation/cli.ts', import.meta.url))
const TS_CHECKS_MODULES = fileURLToPath(new URL('../node_modules', import.meta.url))
const ROOT_TIERS = fileURLToPath(new URL('../../../vitest.tiers.mts', import.meta.url))

const member = (path: string): TestMember => ({
  path,
  name: `@x/${path.split('/').at(-1) ?? ''}`,
  script: 'vitest run',
  dependencies: [],
})
const MEMBERS = [
  member('packages/core/alpha'),
  member('packages/core/alpha-extra'),
  member('apps/cli'),
  member('tools/repo-toolchain'),
  member('examples/demo'),
]

const temporaries: string[] = []
afterAll(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true })
})
function temporary(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  temporaries.push(path)
  return path
}

describe('范围：改动行按成员分组', () => {
  it('a deletion before line one does not become an invalid zero-line mutation range', () => {
    const changed = parseDiff(
      [
        'diff --git a/packages/core/alpha/src/a.ts b/packages/core/alpha/src/a.ts',
        '--- a/packages/core/alpha/src/a.ts',
        '+++ b/packages/core/alpha/src/a.ts',
        '@@ -1 +0,0 @@',
        '-removed import',
        '@@ -4 +3 @@',
        '-old effect',
        '+new effect',
      ].join('\n'),
    )
    expect(changedTargets(changed, MEMBERS).map(mutateEntries)).toEqual([['src/a.ts:3-3']])
    expect(changedTargets(new Map([['packages/core/alpha/src/a.ts', [[0, 0]]]]), MEMBERS)).toEqual(
      [],
    )
  })
  it('只留 packages/ 与 apps/ 成员 src/ 下的源码；测试、类型声明、工具与示例不在内', () => {
    const changed = new Map<string, [number, number][]>([
      ['packages/core/alpha/src/a.ts', [[3, 5]]],
      ['packages/core/alpha/src/types.d.ts', [[1, 2]]],
      ['packages/core/alpha/tests/a.spec.ts', [[1, 9]]],
      ['packages/core/alpha/README.md', [[1, 1]]],
      ['packages/core/alpha-extra/src/b.mts', [[7, 7]]],
      ['apps/cli/src/main.tsx', [[1, Number.POSITIVE_INFINITY]]],
      ['tools/product-checks/src/cli.ts', [[1, 4]]],
      ['examples/demo/src/x.ts', [[1, 4]]],
    ])
    const targets = changedTargets(changed, MEMBERS)
    expect(targets.map(target => [target.member.path, [...target.lines.keys()]])).toEqual([
      ['apps/cli', ['apps/cli/src/main.tsx']],
      ['packages/core/alpha', ['packages/core/alpha/src/a.ts']],
      // `alpha-extra` 不因前缀与 `alpha` 相同而被归错。
      ['packages/core/alpha-extra', ['packages/core/alpha-extra/src/b.mts']],
    ])
    expect(targets.map(mutateEntries)).toEqual([
      ['src/main.tsx'],
      ['src/a.ts:3-5'],
      ['src/b.mts:7-7'],
    ])
  })

  it('接在 diff 解析之后：新增、删除、改名（按删加算）各落到新一侧的行', () => {
    const diff = [
      'diff --git a/packages/core/alpha/src/a.ts b/packages/core/alpha/src/a.ts',
      '--- a/packages/core/alpha/src/a.ts',
      '+++ b/packages/core/alpha/src/a.ts',
      '@@ -4,0 +5,2 @@',
      '+added',
      '+added',
      '@@ -10 +11,0 @@',
      '-removed',
      'diff --git a/packages/core/alpha/src/old.ts b/packages/core/alpha/src/old.ts',
      '--- a/packages/core/alpha/src/old.ts',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
      'diff --git a/packages/core/alpha/src/new.ts b/packages/core/alpha/src/new.ts',
      '--- /dev/null',
      '+++ b/packages/core/alpha/src/new.ts',
      '@@ -0,0 +1,3 @@',
    ].join('\n')
    const [target] = changedTargets(parseDiff(diff), MEMBERS)
    expect(target === undefined ? [] : mutateEntries(target)).toEqual([
      'src/a.ts:5-6',
      // 纯删除记成它所在的那一行：碰过这一处。
      'src/a.ts:11-11',
      'src/new.ts:1-3',
    ])
  })

  it('点名成员：src/ 下的全部源码整份变异，递归、去掉类型声明', () => {
    const root = temporary('mutation-scope-')
    const src = join(root, 'packages/core/alpha/src')
    mkdirSync(join(src, 'inner'), { recursive: true })
    for (const name of ['a.ts', 'inner/b.ts', 'inner/c.d.ts', 'notes.md'])
      writeFileSync(join(src, name), '')
    const [target] = memberTargets(root, [member('packages/core/alpha')])
    expect(target === undefined ? [] : mutateEntries(target)).toEqual([
      'src/a.ts',
      'src/inner/b.ts',
    ])
  })
})

const TARGET: MutationTarget = {
  member: member('packages/core/alpha'),
  lines: new Map([['packages/core/alpha/src/a.ts', [[2, 3]] as const]]),
}

describe('报告汇总', () => {
  const source = [
    'export const x = 1',
    'export const ok = (n: number) =>',
    '  n > 0 && n < 10',
    '',
  ].join('\n')
  const at = (line: number, column: number, endLine: number, endColumn: number) => ({
    start: { line, column },
    end: { line: endLine, column: endColumn },
  })
  const report: MutationReport = {
    files: {
      'src/a.ts': {
        source,
        mutants: [
          {
            id: '1',
            mutatorName: 'EqualityOperator',
            replacement: 'n >= 0',
            status: 'Survived',
            location: at(3, 3, 3, 8),
          },
          {
            id: '2',
            mutatorName: 'ConditionalExpression',
            replacement: 'true',
            status: 'Killed',
            location: at(3, 3, 3, 18),
          },
          {
            id: '3',
            mutatorName: 'ArrowFunction',
            replacement: '() => undefined',
            status: 'NoCoverage',
            static: true,
            location: at(2, 19, 3, 18),
          },
          {
            id: '4',
            mutatorName: 'StringLiteral',
            replacement: '""',
            status: 'Timeout',
            location: at(3, 12, 3, 18),
          },
          // 不在改动行上：不计数，只记一个「范围外」。
          {
            id: '5',
            mutatorName: 'NumericLiteral',
            replacement: '0',
            status: 'Survived',
            location: at(1, 18, 1, 19),
          },
        ],
      },
    },
  }

  it('只计落在改动行上的；分数是测出来的占（测出来＋没测出来）', () => {
    const result = summarizeMember(TARGET, report)
    expect(result.counts).toMatchObject({ Killed: 1, Timeout: 1, Survived: 1, NoCoverage: 1 })
    expect(result.outside).toBe(1)
    expect(result.score).toBe(50)
  })

  it('存活与无覆盖列出位置、算子、原文与替换；跨行的原文压成一行，static 标出来', () => {
    const result = summarizeMember(TARGET, report)
    expect(result.survived).toEqual([
      expect.objectContaining({
        file: 'packages/core/alpha/src/a.ts',
        line: 3,
        original: 'n > 0',
        replacement: 'n >= 0',
      }),
    ])
    expect(result.noCoverage[0]).toMatchObject({
      line: 2,
      original: '(n: number) => n > 0 && n < 10',
      static: true,
    })
    expect(memberLines(result, true)).toEqual([
      'packages/core/alpha：变异体 4 个——被杀 1、超时 1、存活 1、无覆盖 1、编译错误 0、运行错误 0；分数 50%',
      '  存活 packages/core/alpha/src/a.ts:3 EqualityOperator `n > 0` → `n >= 0`',
      '  无覆盖 packages/core/alpha/src/a.ts:2 ArrowFunction（static） `(n: number) => n > 0 && n < 10` → `() => undefined`',
    ])
  })

  it('报成存活、有覆盖却一条用例都没跑完的另列为没跑测试，不计入各状态与分数（#405）', () => {
    const mutant = (
      id: string,
      status: 'Survived' | 'Killed',
      testsCompleted: number | undefined,
      coveredBy: string[] | undefined,
    ) => ({
      id,
      mutatorName: 'EqualityOperator',
      replacement: 'n >= 0',
      status,
      location: at(3, 3, 3, 8),
      ...(testsCompleted === undefined ? {} : { testsCompleted }),
      ...(coveredBy === undefined ? {} : { coveredBy }),
    })
    const result = summarizeMember(TARGET, {
      files: {
        'src/a.ts': {
          source,
          mutants: [
            mutant('1', 'Survived', 0, ['t1']),
            // 跑过用例的、没有覆盖的、两个字段缺了任一个的，都按普通存活算。
            mutant('2', 'Survived', 2, ['t1', 't2']),
            mutant('3', 'Survived', 0, []),
            mutant('4', 'Survived', undefined, ['t1']),
            mutant('5', 'Survived', 0, undefined),
            // 不是存活的不改判。
            mutant('6', 'Killed', 0, ['t1']),
          ],
        },
      },
    })
    expect(result.counts).toMatchObject({ Survived: 4, Killed: 1 })
    expect(result.score).toBe(20)
    expect(result.survived).toHaveLength(4)
    expect(result.notRun).toEqual([expect.objectContaining({ line: 3, original: 'n > 0' })])
    expect(memberLines(result, true)).toEqual([
      'packages/core/alpha：变异体 6 个——被杀 1、超时 0、存活 4、无覆盖 0、编译错误 0、运行错误 0、没跑测试 1；分数 20%',
      ...Array.from(
        { length: 4 },
        () => '  存活 packages/core/alpha/src/a.ts:3 EqualityOperator `n > 0` → `n >= 0`',
      ),
      '  没跑测试 packages/core/alpha/src/a.ts:3 EqualityOperator `n > 0` → `n >= 0`',
    ])
    expect(notRunError(result, 'run/alpha.log')).toBe(
      'packages/core/alpha：1 个变异体有用例覆盖、却一条用例都没跑完，Stryker 报成了存活；判为运行出错，日志 run/alpha.log',
    )
    expect(notRunError(summarizeMember(TARGET, report), 'run/alpha.log')).toBeUndefined()
  })
})

describe('sandbox 与配置', () => {
  it('sandbox 与成员同深度：容器在成员的上两级，Stryker 在容器下再建一层', () => {
    for (const path of ['packages/core/alpha', 'apps/cli']) {
      const sandbox = join(sandboxContainer('/repo', path, '7'), 'sandbox-abc')
      expect(relative('/repo', sandbox).split(sep)).toHaveLength(path.split('/').length)
    }
    expect(sandboxContainer('/repo', 'packages/core/alpha', '7')).toBe(
      '/repo/packages/.stryker-tmp-packages__core__alpha-7',
    )
  })

  it('配置：vitest runner 读 sandbox 里放宽时限的配置、不只挑相关测试、改动行的 mutate、报告落在运行目录、只报告不设线', () => {
    const config = strykerConfig(TARGET, {
      root: '/repo',
      runDir: '/out',
      concurrency: 3,
      testTimeoutSeconds: 60,
      nonce: '7',
    })
    expect(config).toMatchObject({
      testRunner: 'vitest',
      vitest: { configFile: 'vitest.stryker-sandbox.config.mts', related: false },
      mutate: ['src/a.ts:2-3'],
      symlinkNodeModules: false,
      tempDirName: '/repo/packages/.stryker-tmp-packages__core__alpha-7',
      concurrency: 3,
      jsonReporter: { fileName: '/out/packages__core__alpha.mutation.json' },
      thresholds: { break: null },
    })
  })
})

/** 一个有产品成员和工具成员的仓库，已提交一次。 */
function cliFixture(): string {
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
const cliRoot = cliFixture()

/** 写一份手写计划：基线引用 HEAD，合并点 `mergeBase`，只选 `test` 里的成员。 */
function writePlan(head: string, mergeBase: string, test: string[]): string {
  const path = join(temporary('mutation-plan-'), 'plan.json')
  const file = {
    head,
    dirty: true,
    base: { ref: 'HEAD', mergeBase },
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
const cli = (...args: string[]) => cliAt(cliRoot, ...args)
function cliAt(root: string, ...args: string[]) {
  return spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args, '--root', root], {
    encoding: 'utf8',
  })
}

describe('入口的参数', () => {
  it('--base、--plan 与 --members 只能给一个；不是产品成员的拒绝', () => {
    expect(cli('run', '--base', 'HEAD', '--members', 'apps/cli', '--plan-only').status).toBe(2)
    expect(cli('run', '--plan', 'plan.json', '--base', 'HEAD', '--plan-only').status).toBe(2)
    expect(cli('run', '--plan', 'plan.json', '--members', 'apps/cli', '--plan-only').status).toBe(2)
    const tool = cli('run', '--members', 'tools/repo-toolchain', '--plan-only')
    expect(tool.status).toBe(2)
    expect(tool.stderr).toContain('只变异产品源码')
    expect(cli('run', '--members', 'packages/core/nope', '--plan-only').stderr).toContain(
      '不是带测试的 workspace 成员',
    )
  })

  it('点名成员只列范围：写明跑快层', () => {
    const planned = cli('run', '--members', 'packages/core/canary', '--plan-only')
    expect(planned.status, planned.stderr).toBe(0)
    expect(planned.stdout).toContain('只跑快层（vitest 的 mode 为 fast）')
    expect(planned.stdout).toMatch(/packages\/core\/canary：1 个文件/u)
  })

  // 缺省基线：有任务上下文时取它固定的基线，否则 main，与 test:affected 相同。
  it('不给范围时按缺省基线在本仓库现算计划', { tags: ['slow'], timeout: 120_000 }, () => {
    const ran = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'run', '--plan-only'],
      { encoding: 'utf8' },
    )
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stdout).toMatch(/变异范围：基线 |没有可变异的改动：基线 /u)
  })

  it('--plan 读准入检查的计划：变异计划里的成员；有计划外的改动、或计划不是当前提交算的就拒绝', () => {
    const root = cliFixture()
    writeFileSync(join(root, 'packages/core/canary/src/index.ts'), 'export const value = 2\n')
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const planFile = (test: string[], at = head) => writePlan(at, head, test)
    const selected = cliAt(root, 'run', '--plan', planFile(['packages/core/canary']), '--plan-only')
    expect(selected.status, selected.stderr).toBe(0)
    expect(selected.stdout).toMatch(/packages\/core\/canary：1 个文件/u)
    // 计划算完后工作树又改了计划外的成员：不静默跳过，要求重算。
    const outside = cliAt(root, 'run', '--plan', planFile([]), '--plan-only')
    expect(outside.status).toBe(2)
    expect(outside.stderr).toContain('计划外的成员：packages/core/canary')
    const stale = cliAt(root, 'run', '--plan', planFile([], '0'.repeat(40)), '--plan-only')
    expect(stale.status).toBe(2)
    expect(stale.stderr).toContain('重新算计划')
  })
})

// 真起 Stryker：一次约十几到几十秒，归慢层。
describe('夹具项目上真起 Stryker', { tags: ['slow'] }, () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  /** 一个只有一个成员的仓库：成员的 node_modules 指向 ts-checks 的（Stryker 注入 sandbox 的文件要导入 vitest）。 */
  function fixture(): { root: string; memberDir: string } {
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
    symlinkSync(TS_CHECKS_MODULES, join(memberDir, 'node_modules'), 'dir')
    git(root, 'init', '--quiet')
    git(root, 'add', '.')
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'base')
    return { root, memberDir }
  }

  /** 夹具没有本仓库的影响面规则，现算不出计划：手写一份只选这个成员的计划，走准入检查读计划的路径。 */
  function mutate(root: string, out: string) {
    const head = git(root, 'rev-parse', 'HEAD').trim()
    const planPath = writePlan(head, head, ['packages/core/sign'])
    const ran = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'run', '--root', root, '--plan', planPath, '--out', out],
      { encoding: 'utf8', env: { ...process.env, VITEST_MAX_WORKERS: '2' } },
    )
    const summary = existsSync(join(out, 'summary.json'))
      ? (JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as {
          members: {
            counts: Record<string, number>
            survived: { line: number }[]
            outside: number
          }[]
          errors: string[]
        })
      : undefined
    return { ran, summary }
  }

  it('没断言的测试留下存活变异体，补上断言后被杀；只变异改动行，跑完不留 sandbox', () => {
    const { root, memberDir } = fixture()
    // 未提交的改动：新加一个函数，测试只调用不断言。
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { isPositive, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "test('calls only', () => { isPositive(1) })",
      ].join('\n'),
    )
    const weak = mutate(root, join(root, 'out-weak'))
    expect(weak.ran.status, `${weak.ran.stdout}${weak.ran.stderr}`).toBe(0)
    // 读到的计划写进运行目录。
    expect(existsSync(join(root, 'out-weak', 'plan.json'))).toBe(true)
    expect(weak.summary?.errors).toEqual([])
    const [before] = weak.summary?.members ?? []
    expect(before?.counts['Survived']).toBeGreaterThan(0)
    // 第 1 行（没改的 `zero`）上的变异体不在范围内。
    expect(before?.survived.every(finding => finding.line >= 2 && finding.line <= 4)).toBe(true)
    expect(
      readdirSync(join(root, 'packages')).filter(name => name.startsWith('.stryker-tmp')),
    ).toEqual([])
    expect(readFileSync(join(root, 'out-weak/summary.md'), 'utf8')).toContain(
      '只跑快层（vitest 的 mode 为 fast）',
    )

    // 补上断言的那条放进只按包名导入的文件：只有它守着改动行，被杀就说明这份文件跑了、自引用走到了插过桩的代码。
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      "import { zero } from '../src/sign.ts'\ntest('zero', () => { expect(zero).toBe(0) })\n",
    )
    writeFileSync(
      join(memberDir, 'tests/public.spec.ts'),
      [
        "import { isPositive } from '@fixture/sign'",
        "test('sign', () => { expect(isPositive(1)).toBe(true); expect(isPositive(0)).toBe(false); expect(isPositive(-1)).toBe(false) })",
      ].join('\n'),
    )
    const strong = mutate(root, join(root, 'out-strong'))
    expect(strong.ran.status, `${strong.ran.stdout}${strong.ran.stderr}`).toBe(0)
    const [after] = strong.summary?.members ?? []
    expect(after?.counts['Survived']).toBe(0)
    expect(after?.counts['NoCoverage']).toBe(0)
    expect(after?.counts['Killed']).toBeGreaterThan(0)
    // 只有工作树里改的、加的那几份文件，别的什么都没留下。
    expect(
      git(root, 'status', '--short')
        .split('\n')
        .filter(line => line !== '')
        .sort(),
    ).toEqual([
      ' M packages/core/sign/src/sign.ts',
      '?? out-strong/',
      '?? out-weak/',
      '?? packages/core/sign/tests/public.spec.ts',
    ])
  })

  it('只由参数化用例守着的改动行照样被杀：按用例名过滤时不因快层的 preParse 整份滤掉（#405）', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    // 用例名由 it.each 生成，preParse 静态匹配不到；Stryker 逐个变异体按用例名过滤。
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { isPositive, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "it.each([[1, true], [0, false], [-1, false]])('isPositive(%i) is %s', (n, want) => { expect(isPositive(n)).toBe(want) })",
      ].join('\n'),
    )
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
    expect(ran.summary?.errors).toEqual([])
    const [member] = ran.summary?.members ?? []
    expect(member?.counts['Survived']).toBe(0)
    expect(member?.counts['Killed']).toBeGreaterThan(0)
  })
})
