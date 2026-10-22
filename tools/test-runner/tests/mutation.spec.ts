// 差分变异：范围（改动行 → 各成员的 mutate 条目）、报告汇总、sandbox 的位置、入口的参数，
// 以及一个小夹具项目上真起 Stryker：没断言的测试留下存活变异体，补上断言后被杀；测试文件在 sandbox 里加载失败时预检报错（#481）。
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  realpathSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parseDiff } from '@omne-harness/repo-toolchain/core/git'
import {
  memberLines,
  notRunError,
  staticTimeoutError,
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
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
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
  it('static 变异体只因时限到了而超时的另列为 static 超时，不计入各状态与分数；命中次数超限的与非 static 的照旧算测出（#649）', () => {
    const timeout = (id: string, isStatic: boolean, statusReason?: string) => ({
      id,
      mutatorName: 'EqualityOperator',
      replacement: 'n >= 0',
      status: 'Timeout' as const,
      static: isStatic,
      location: at(3, 3, 3, 8),
      ...(statusReason === undefined ? {} : { statusReason }),
    })
    const result = summarizeMember(TARGET, {
      files: {
        'src/a.ts': {
          source,
          mutants: [
            timeout('1', true),
            timeout('2', true, 'Hit limit reached (501/500)'),
            timeout('3', false),
            {
              id: '4',
              mutatorName: 'EqualityOperator',
              replacement: 'n >= 0',
              status: 'Survived',
              static: true,
              location: at(3, 3, 3, 8),
            },
          ],
        },
      },
    })
    expect(result.counts).toMatchObject({ Timeout: 2, Survived: 1 })
    expect(result.score).toBe(66.7)
    expect(result.staticTimeout).toEqual([
      expect.objectContaining({ line: 3, original: 'n > 0', static: true }),
    ])
    expect(memberLines(result, true)).toEqual([
      'packages/core/alpha：变异体 4 个——被杀 0、超时 2、存活 1、无覆盖 0、编译错误 0、运行错误 0、static 超时 1；分数 66.7%',
      '  存活 packages/core/alpha/src/a.ts:3 EqualityOperator（static） `n > 0` → `n >= 0`',
      '  static 超时 packages/core/alpha/src/a.ts:3 EqualityOperator（static） `n > 0` → `n >= 0`',
    ])
    expect(staticTimeoutError(result, 'run/alpha.log')).toMatch(
      /^packages\/core\/alpha：1 个 static 变异体.*超过了 Stryker 按初跑估出的时限.*没有计分；判为测量无效.*日志 run\/alpha\.log$/u,
    )
    expect(staticTimeoutError(summarizeMember(TARGET, report), 'run/alpha.log')).toBeUndefined()
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
      testRunner: 'omne-vitest',
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

  // 缺省基线：按统一规则取（任务上下文固定的基线，再取 origin/main，最后取 main），与 test:affected 相同。
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
  function mutate(root: string, out: string, workers = '2') {
    const head = git(root, 'rev-parse', 'HEAD').trim()
    const planPath = writePlan(head, head, ['packages/core/sign'])
    const ran = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'run', '--root', root, '--plan', planPath, '--out', out],
      {
        encoding: 'utf8',
        env: { ...process.env, BASELINE: undefined, VITEST_MAX_WORKERS: workers },
      },
    )
    const summary = existsSync(join(out, 'summary.json'))
      ? (JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as {
          members: {
            counts: Record<string, number>
            survived: { line: number }[]
            staticTimeout: { line: number }[]
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
    // 同一个 `--out` 目录里留着上一次预检失败的标记，这一次预检通过就照常出读数。
    mkdirSync(join(root, 'out-strong'))
    writeFileSync(join(root, 'out-strong/packages__core__sign.preflight-failed'), '')
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

  /** 改动行：第 2 行是只在模块加载时求值的 static 变异体，没有断言守着；第 3～5 行由 sign 的断言守着。 */
  function staticFixture(): { root: string; memberDir: string } {
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

  // Vitest 只在一个实例第一次运行时报告类型测试；上游 runner 在同一工作进程里复用实例，初跑之后的 static 运行就静默少了它们。
  it('static 变异体的运行与初跑跑同样的测试，类型测试不缺席；没有断言守着的照样记为存活（#649）', () => {
    const { root, memberDir } = staticFixture()
    writeFileSync(
      join(memberDir, 'vitest.config.ts'),
      [
        "import { testTiers } from '../../../vitest.tiers.mts'",
        'export default ({ mode }) => ({',
        '  test: {',
        "    ...testTiers(mode), globals: true, include: ['tests/**/*.spec.ts'],",
        "    typecheck: { ...testTiers(mode).typecheck, enabled: true, include: ['tests/**/*.spec-d.ts'], tsconfig: './tsconfig.test.json' },",
        '  },',
        '})',
      ].join('\n'),
    )
    writeFileSync(
      join(memberDir, 'tsconfig.test.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'nodenext',
          target: 'es2022',
          noEmit: true,
          allowImportingTsExtensions: true,
          skipLibCheck: true,
        },
        include: ['src', 'tests/**/*.spec-d.ts'],
      }),
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec-d.ts'),
      "import { expectTypeOf, test } from 'vitest'\nimport { isPositive } from '../src/sign.ts'\ntest('returns boolean', () => { expectTypeOf(isPositive).returns.toEqualTypeOf<boolean>() })\n",
    )
    // 一个工作进程：static 变异体落在跑过初跑的那个进程里，旧行为下必然少掉类型测试。
    const ran = mutate(root, join(root, 'out'), '1')
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
    expect(ran.summary?.errors).toEqual([])
    const [member] = ran.summary?.members ?? []
    expect(member?.survived.map(finding => finding.line)).toEqual([2])
    const report = JSON.parse(
      readFileSync(join(root, 'out/packages__core__sign.mutation.json'), 'utf8'),
    ) as {
      files: Record<
        string,
        { mutants: { static?: boolean; status: string; testsCompleted?: number }[] }
      >
      testFiles: Record<string, { tests: unknown[] }>
    }
    const dryRunTests = Object.values(report.testFiles).reduce(
      (sum, file) => sum + file.tests.length,
      0,
    )
    expect(report.testFiles['tests/sign.spec-d.ts']?.tests).toHaveLength(1)
    const staticMutants = Object.values(report.files).flatMap(file =>
      file.mutants.filter(mutant => mutant.static === true),
    )
    expect(staticMutants).toEqual([
      expect.objectContaining({ status: 'Survived', testsCompleted: dryRunTests }),
    ])
  })

  it('static 运行超过 Stryker 按初跑估出的时限时不算测出：另列为 static 超时，成员测量无效，退出 1（#649）', () => {
    const { root, memberDir } = staticFixture()
    // 可控的耗时注入：不导入源码，只有跑全部测试的 static 运行会跑它；只在有变异体激活时等待，初跑不受影响，
    // 时限就按快的初跑估出，static 运行必然超过。不依赖机器负载。
    writeFileSync(
      join(memberDir, 'tests/delay.spec.ts'),
      [
        "test('slow only under an active mutant', async () => {",
        '  if ((globalThis as { __stryker__?: { activeMutant?: string } }).__stryker__?.activeMutant !== undefined)',
        '    await new Promise(resolve => setTimeout(resolve, 60_000))',
        '}, 120_000)',
      ].join('\n'),
    )
    const out = join(root, 'out')
    const ran = mutate(root, out)
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    const [member] = ran.summary?.members ?? []
    expect(member?.staticTimeout.map(finding => finding.line)).toEqual([2])
    expect(member?.counts['Timeout']).toBe(0)
    expect(member?.counts['Survived']).toBe(0)
    // 非 static 的变异体照常计分。
    expect(member?.counts['Killed']).toBeGreaterThan(0)
    expect(ran.summary?.errors).toEqual([expect.stringContaining('1 个 static 变异体')])
    expect(ran.ran.stdout).toContain('static 超时 1')
    const raw = readFileSync(join(out, 'packages__core__sign.mutation.json'), 'utf8')
    expect(JSON.parse(raw)).toMatchObject({
      files: {
        'src/sign.ts': {
          mutants: expect.arrayContaining([
            expect.objectContaining({ status: 'Timeout', static: true }),
          ]),
        },
      },
    })
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

  it.each(['module', 'suite'] as const)(
    '静态变异使文件或深层 suite 自身出错时成员无效，原始报告保留；同 out 重跑不复用错误（%s）',
    container => {
      const { root, memberDir } = fixture()
      writeFileSync(
        join(memberDir, 'src/sign.ts'),
        "export const zero = 0\nexport function names(): string[] { return ['alpha', 'beta'] }\n",
      )
      // describe 收集异常归模块；内层 beforeAll 才产生 suite 自身错误，顶层调用保留静态变异。
      writeFileSync(
        join(memberDir, 'tests/collection.spec.ts'),
        [
          "import { names } from '../src/sign.ts'",
          ...(container === 'suite'
            ? [
                'const collectedNames = names()',
                "describe('collection outer', () => {",
                "describe('collection inner', () => {",
                'beforeAll(() => { Array.from(collectedNames) })',
                "test('registered', () => { expect(collectedNames).toBeDefined() })",
                '})',
                '})',
              ]
            : [
                'for (const name of names()) test(name, () => { expect(name.length).toBeGreaterThan(0) })',
              ]),
        ].join('\n'),
      )
      const out = join(root, 'out')
      const invalid = mutate(root, out)
      const evidence = process.env['OMNE_MUTATION_FIXTURE_EVIDENCE']
      if (evidence !== undefined) {
        mkdirSync(evidence, { recursive: true })
        cpSync(out, join(evidence, `static-collection-${container}`), { recursive: true })
        writeFileSync(
          join(evidence, `static-cli-${container}.txt`),
          invalid.ran.stdout + invalid.ran.stderr,
        )
      }
      expect(invalid.ran.status, invalid.ran.stdout + invalid.ran.stderr).toBe(1)
      expect(invalid.summary?.members).toEqual([])
      expect(invalid.summary?.errors).toEqual([expect.stringContaining('RuntimeError')])
      const raw = readFileSync(join(out, 'packages__core__sign.mutation.json'), 'utf8')
      expect(raw).toContain('RuntimeError')
      expect(raw).toContain('collection.spec.ts')
      expect(raw).toContain('文件或 suite 收集错误')
      if (container === 'suite') {
        const report: unknown = JSON.parse(raw)
        expect(report).toMatchObject({
          files: {
            'src/sign.ts': {
              mutants: expect.arrayContaining([
                expect.objectContaining({
                  status: 'RuntimeError',
                  static: true,
                  statusReason: expect.stringContaining(
                    '"suite":"collection outer > collection inner"',
                  ),
                }),
              ]),
            },
          },
        })
      }
      rmSync(join(memberDir, 'tests/collection.spec.ts'))
      const rerun = mutate(root, out)
      expect(rerun.ran.status, rerun.ran.stdout + rerun.ran.stderr).toBe(0)
      expect(rerun.summary?.errors).toEqual([])
      expect(rerun.summary?.members).toHaveLength(1)
      const history = readdirSync(out).filter(name => name.includes('.history-'))
      expect(history).toHaveLength(1)
      expect(
        readFileSync(join(out, history[0] ?? '', 'packages__core__sign.mutation.json'), 'utf8'),
      ).toBe(raw)
      writeFileSync(
        join(memberDir, 'tests/broken.spec.ts'),
        "throw new Error('fresh preflight failure')",
      )
      const failedRerun = mutate(root, out)
      expect(failedRerun.ran.status, failedRerun.ran.stdout + failedRerun.ran.stderr).toBe(1)
      expect(failedRerun.summary?.members).toEqual([])
      expect(failedRerun.summary?.errors).toEqual([expect.stringContaining('sandbox 预检没通过')])
      expect(existsSync(join(out, 'packages__core__sign.mutation.json'))).toBe(false)
      expect(readdirSync(out).filter(name => name.includes('.history-'))).toHaveLength(2)
    },
  )

  it('有测试文件在 sandbox 里加载失败就报错、不出读数，别的文件里的用例全过也一样（#481）', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { isPositive, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "test('sign', () => { expect(isPositive(1)).toBe(true); expect(isPositive(0)).toBe(false) })",
      ].join('\n'),
    )
    // 相对路径的 alias 在原目录解析回成员自己，在 sandbox 里指向容器下不存在的 sign 目录：
    // 这份文件只在 sandbox 里加载失败，Stryker 的 vitest runner 不看文件级结果，初跑仍算成功。
    writeFileSync(
      join(memberDir, 'vitest.config.ts'),
      [
        "import { fileURLToPath } from 'node:url'",
        "import { testTiers } from '../../../vitest.tiers.mts'",
        'export default ({ mode }) => ({',
        "  resolve: { alias: [{ find: /^#sign$/, replacement: fileURLToPath(new URL('../sign/src/sign.ts', import.meta.url)) }] },",
        '  test: {',
        "    ...testTiers(mode), globals: true, include: ['tests/**/*.spec.ts'],",
        "    typecheck: { ...testTiers(mode).typecheck, enabled: true, include: ['tests/**/*.spec-d.ts'], tsconfig: './tsconfig.test.json' },",
        '  },',
        '})',
      ].join('\n'),
    )
    // #481 的原始形态：类型断言照常通过，运行时的文件加载失败。没有 tsconfig 时 tsc 只打印帮助，类型断言不会真跑；
    // 与仓库成员一样叫 tsconfig.test.json：成员根有 tsconfig.json 时，构建脚本的 `tsc src/sign.ts` 会拒绝运行。
    writeFileSync(
      join(memberDir, 'tsconfig.test.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'nodenext',
          target: 'es2022',
          noEmit: true,
          allowImportingTsExtensions: true,
          skipLibCheck: true,
        },
        include: ['src', 'tests/**/*.spec-d.ts'],
      }),
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec-d.ts'),
      "import { expectTypeOf, test } from 'vitest'\nimport { isPositive } from '../src/sign.ts'\ntest('returns boolean', () => { expectTypeOf(isPositive).returns.toEqualTypeOf<boolean>() })\n",
    )
    writeFileSync(
      join(memberDir, 'tests/alias.spec.ts'),
      "import { isPositive } from '#sign'\ntest('via alias', () => { expect(isPositive(2)).toBe(true) })\n",
    )
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    expect(ran.summary?.members).toEqual([])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('sandbox 预检没通过')])
    const log = readFileSync(join(root, 'out/packages__core__sign.log'), 'utf8')
    expect(log).toMatch(/FAIL\s+tests\/alias\.spec\.ts/u)
    // sign.spec.ts 的两条与 sign.spec-d.ts 的一条类型断言都通过，类型检查没有报错。
    expect(log).toMatch(/Tests\s+3 passed/u)
    expect(log).toMatch(/Type Errors\s+no errors/u)
  })

  it('只在 Stryker 用的 threads 池里加载失败的测试文件，预检同样拦下', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isNegative(n: number): boolean {\n  return n < 0\n}\n',
    )
    // 顶层 process.chdir 在 forks 池里能加载，在 worker_threads 里抛错；Stryker 初跑固定用 threads。
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        'process.chdir(process.cwd())',
        "import { isNegative } from '../src/sign.ts'",
        "test('sign', () => { expect(isNegative(-1)).toBe(true); expect(isNegative(0)).toBe(false) })",
      ].join('\n'),
    )
    writeFileSync(
      join(memberDir, 'tests/zero.spec.ts'),
      "import { zero } from '../src/sign.ts'\ntest('zero', () => { expect(zero).toBe(0) })\n",
    )
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    expect(ran.summary?.members).toEqual([])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('sandbox 预检没通过')])
  })

  it('快层一条用例都没有时预检通过，由 Stryker 自己报没有用例，不算成加载失败', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      'export const zero = 0\nexport function isPositive(n: number): boolean {\n  return n > 0\n}\n',
    )
    // 只剩慢层那条：快层的 passWithNoTests 让预检退出 0。
    rmSync(join(memberDir, 'tests/sign.spec.ts'))
    const ran = mutate(root, join(root, 'out'))
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    expect(ran.summary?.members).toEqual([])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('Stryker 退出码 1')])
    expect(readFileSync(join(root, 'out/packages__core__sign.log'), 'utf8')).toContain(
      'No tests were executed',
    )
  })
})
