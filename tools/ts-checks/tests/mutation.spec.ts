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
import { parseDiff } from '../src/metrics/git.ts'
import { memberLines, summarizeMember, type MutationReport } from '../src/mutation/report.ts'
import {
  changedTargets,
  memberTargets,
  mutateEntries,
  type MutationTarget,
} from '../src/mutation/scope.ts'
import { sandboxContainer, strykerConfig } from '../src/mutation/stryker.ts'
import type { TestMember } from '../src/testing/affected.ts'

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
  member('tools/ts-checks'),
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
  it('只留 packages/ 与 apps/ 成员 src/ 下的源码；测试、类型声明、工具与示例不在内', () => {
    const changed = new Map<string, [number, number][]>([
      ['packages/core/alpha/src/a.ts', [[3, 5]]],
      ['packages/core/alpha/src/types.d.ts', [[1, 2]]],
      ['packages/core/alpha/tests/a.spec.ts', [[1, 9]]],
      ['packages/core/alpha/README.md', [[1, 1]]],
      ['packages/core/alpha-extra/src/b.mts', [[7, 7]]],
      ['apps/cli/src/main.tsx', [[1, Number.POSITIVE_INFINITY]]],
      ['tools/ts-checks/src/cli.ts', [[1, 4]]],
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

  it('配置：vitest runner、改动行的 mutate、报告落在运行目录、只报告不设线', () => {
    const config = strykerConfig(TARGET, {
      root: '/repo',
      runDir: '/out',
      concurrency: 3,
      nonce: '7',
    })
    expect(config).toMatchObject({
      testRunner: 'vitest',
      mutate: ['src/a.ts:2-3'],
      symlinkNodeModules: false,
      tempDirName: '/repo/packages/.stryker-tmp-packages__core__alpha-7',
      concurrency: 3,
      jsonReporter: { fileName: '/out/packages__core__alpha.mutation.json' },
      thresholds: { break: null },
    })
  })
})

const cli = (...args: string[]) =>
  spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args], { encoding: 'utf8' })

describe('入口的参数', () => {
  it('--base 与 --members 二选一；不是产品成员的拒绝', () => {
    expect(cli('run', '--plan-only').status).toBe(2)
    expect(cli('run', '--base', 'HEAD', '--members', 'apps/cli', '--plan-only').status).toBe(2)
    const tool = cli('run', '--members', 'tools/ts-checks', '--plan-only')
    expect(tool.status).toBe(2)
    expect(tool.stderr).toContain('只变异产品源码')
    expect(cli('run', '--members', 'packages/core/nope', '--plan-only').stderr).toContain(
      '不是带测试的 workspace 成员',
    )
  })

  it('点名成员只列范围：写明跑快层', () => {
    const planned = cli('run', '--members', 'packages/core/kernel-basis', '--plan-only')
    expect(planned.status, planned.stderr).toBe(0)
    expect(planned.stdout).toContain('只跑快层（OMNE_TEST_TIER=fast）')
    expect(planned.stdout).toMatch(/packages\/core\/kernel-basis：\d+ 个文件/u)
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
    writeFileSync(join(root, 'package.json'), '{ "name": "fixture-root", "private": true }\n')
    writeFileSync(join(root, '.gitignore'), 'node_modules\n.stryker-tmp*\n')
    copyFileSync(ROOT_TIERS, join(root, 'vitest.tiers.mts'))
    writeFileSync(
      join(memberDir, 'package.json'),
      JSON.stringify({
        name: '@fixture/sign',
        private: true,
        type: 'module',
        scripts: { build: 'node -e ""', test: 'vitest run' },
      }),
    )
    writeFileSync(
      join(memberDir, 'vitest.config.ts'),
      [
        "import { testTiers } from '../../../vitest.tiers.mts'",
        "export default { test: { ...testTiers(), globals: true, include: ['tests/**/*.spec.ts'] } }",
      ].join('\n'),
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

  function mutate(root: string, out: string) {
    const ran = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'run', '--root', root, '--base', 'HEAD', '--out', out],
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
    expect(weak.summary?.errors).toEqual([])
    const [before] = weak.summary?.members ?? []
    expect(before?.counts['Survived']).toBeGreaterThan(0)
    // 第 1 行（没改的 `zero`）上的变异体不在范围内。
    expect(before?.survived.every(finding => finding.line >= 2 && finding.line <= 4)).toBe(true)
    expect(
      readdirSync(join(root, 'packages')).filter(name => name.startsWith('.stryker-tmp')),
    ).toEqual([])
    expect(readFileSync(join(root, 'out-weak/summary.md'), 'utf8')).toContain(
      '只跑快层（OMNE_TEST_TIER=fast）',
    )

    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { isPositive, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "test('sign', () => { expect(isPositive(1)).toBe(true); expect(isPositive(0)).toBe(false); expect(isPositive(-1)).toBe(false) })",
      ].join('\n'),
    )
    const strong = mutate(root, join(root, 'out-strong'))
    expect(strong.ran.status, `${strong.ran.stdout}${strong.ran.stderr}`).toBe(0)
    const [after] = strong.summary?.members ?? []
    expect(after?.counts['Survived']).toBe(0)
    expect(after?.counts['Killed']).toBeGreaterThan(0)
    // 只改了工作树里的两份文件，别的什么都没留下。
    expect(
      git(root, 'status', '--short')
        .split('\n')
        .filter(line => line !== '')
        .sort(),
    ).toEqual([
      ' M packages/core/sign/src/sign.ts',
      ' M packages/core/sign/tests/sign.spec.ts',
      '?? out-strong/',
      '?? out-weak/',
    ])
  })
})
