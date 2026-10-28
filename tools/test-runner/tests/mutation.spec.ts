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
  exactEntry,
  memberErrors,
  planRecheck,
  recheckTargets,
  summarizeMember,
  type MutationReport,
  type SummaryInputs,
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
            // 命中次数超限的超时不用复核，照旧算测出。
            statusReason: 'Hit limit reached (501/500)',
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

  it('报成存活、有覆盖却一条用例都没跑完的另列为没跑测试，不计入各状态，成员测量无效、不给分数（#405）', () => {
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
    expect(result).toMatchObject({ valid: false, score: null })
    expect(result.survived).toHaveLength(4)
    expect(result.invalid).toEqual([
      expect.objectContaining({ line: 3, original: 'n > 0', reason: 'notRun' }),
    ])
    expect(memberLines(result, true)).toEqual([
      'packages/core/alpha：变异体 6 个——被杀 1、超时 0、存活 4、无覆盖 0、编译错误 0、运行错误 0、没跑测试 1；分数 —（测量无效）',
      ...Array.from(
        { length: 4 },
        () => '  存活 packages/core/alpha/src/a.ts:3 EqualityOperator `n > 0` → `n >= 0`',
      ),
      '  没跑测试 packages/core/alpha/src/a.ts:3 EqualityOperator `n > 0` → `n >= 0`',
    ])
    const paths = { logPath: 'run/alpha.log', reports: ['run/alpha.json'] }
    expect(memberErrors(result, paths)).toEqual([
      'packages/core/alpha：1 个变异体有用例覆盖、却一条用例都没跑完，Stryker 报成了存活；判为运行出错，日志 run/alpha.log',
    ])
    expect(memberErrors(summarizeMember(TARGET, report), paths)).toEqual([])
  })
  describe('改动段上没有变异体（#737）', () => {
    // Stryker 把 `x as T` 整个当类型位置跳过：`as const` 里的字面量不生成变异体。
    const constSource = [
      'export const ok = (n: number) => n > 0',
      '',
      "export const TIERS = ['fast', 'slow'] as const",
      '',
    ].join('\n')
    const killed = (id: string) => ({
      id,
      mutatorName: 'EqualityOperator',
      replacement: 'n >= 0',
      status: 'Killed' as const,
      location: at(1, 34, 1, 39),
    })
    const withMutants: MutationReport = {
      files: { 'src/a.ts': { source: constSource, mutants: [killed('1'), killed('2')] } },
    }
    const targetOf = (...ranges: [number, number][]): MutationTarget => ({
      member: member('packages/core/alpha'),
      lines: new Map([['packages/core/alpha/src/a.ts', ranges]]),
    })

    it('别的改动段有变异体且全杀时：不报光秃秃的 100%，列出没有变异体的改动段', () => {
      const result = summarizeMember(targetOf([1, 1], [3, 3]), withMutants)
      expect(result.counts.Killed).toBe(2)
      expect(result.unmutated).toEqual([{ file: 'packages/core/alpha/src/a.ts', start: 3, end: 3 }])
      const [headline, ...rest] = memberLines(result, true)
      expect(headline).not.toMatch(/分数 100%$/u)
      expect(headline).toContain('未覆盖 1 段')
      expect(rest).toContain('  没有变异体 packages/core/alpha/src/a.ts:3')
    })

    it('改动只落在 as const 声明上：没有分数，报未覆盖并列出改动行', () => {
      const result = summarizeMember(targetOf([3, 3]), withMutants)
      expect(result).toMatchObject({ valid: true, score: null, outside: 2 })
      expect(result.unmutated).toEqual([{ file: 'packages/core/alpha/src/a.ts', start: 3, end: 3 }])
      expect(memberLines(result, false)[0]).toContain('分数 —（未覆盖 1 段：改动上没有变异体）')
      expect(memberLines(result, true)).toContain('  没有变异体 packages/core/alpha/src/a.ts:3')
    })

    it('报告里没有这份文件（一个变异体都没生成）、整份变异的文件：同样列出', () => {
      const whole: MutationTarget = {
        member: member('packages/core/alpha'),
        lines: new Map<string, readonly (readonly [number, number])[]>([
          ['packages/core/alpha/src/a.ts', [[1, 1]]],
          ['packages/core/alpha/src/types.ts', [[1, Number.POSITIVE_INFINITY]]],
        ]),
      }
      const result = summarizeMember(whole, withMutants)
      expect(result.unmutated).toEqual([
        { file: 'packages/core/alpha/src/types.ts', start: 1, end: null },
      ])
      expect(memberLines(result, true)).toContain('  没有变异体 packages/core/alpha/src/types.ts')
    })

    it('每段改动都有变异体时不列、分数照旧', () => {
      const result = summarizeMember(targetOf([1, 3]), withMutants)
      expect(result.unmutated).toEqual([])
      expect(memberLines(result, false)[0]).toMatch(/分数 100%$/u)
    })

    it('只被不计分的变异体（编译错误、忽略）碰到的改动段也算没有变异体', () => {
      const unscored: MutationReport = {
        files: {
          'src/a.ts': {
            source: constSource,
            mutants: [
              killed('1'),
              { ...killed('2'), status: 'CompileError', location: at(3, 22, 3, 37) },
              { ...killed('3'), status: 'Ignored', location: at(3, 23, 3, 29) },
            ],
          },
        },
      }
      const result = summarizeMember(targetOf([1, 1], [3, 3]), unscored)
      expect(result.unmutated).toEqual([{ file: 'packages/core/alpha/src/a.ts', start: 3, end: 3 }])
    })

    it('跨行的变异体起点在段前、终点落进段里：这一段有变异体', () => {
      const spanning: MutationReport = {
        files: {
          'src/a.ts': {
            source: constSource,
            mutants: [{ ...killed('1'), location: at(1, 1, 3, 10) }],
          },
        },
      }
      expect(summarizeMember(targetOf([3, 3]), spanning).unmutated).toEqual([])
    })

    it('没有变异体的段按文件、起始行排序', () => {
      const unordered: MutationTarget = {
        member: member('packages/core/alpha'),
        lines: new Map<string, readonly (readonly [number, number])[]>([
          [
            'packages/core/alpha/src/b.ts',
            [
              [9, 9],
              [2, 4],
            ],
          ],
          ['packages/core/alpha/src/a.ts', [[3, 3]]],
        ]),
      }
      expect(summarizeMember(unordered, withMutants).unmutated).toEqual([
        { file: 'packages/core/alpha/src/a.ts', start: 3, end: 3 },
        { file: 'packages/core/alpha/src/b.ts', start: 2, end: 4 },
        { file: 'packages/core/alpha/src/b.ts', start: 9, end: 9 },
      ])
    })

    it('测量无效时标题也写出未覆盖几段', () => {
      const broken: MutationReport = {
        files: {
          'src/a.ts': {
            source: constSource,
            mutants: [killed('1'), { ...killed('2'), status: 'RuntimeError' }],
          },
        },
      }
      const result = summarizeMember(targetOf([1, 1], [3, 3]), broken)
      expect(result.valid).toBe(false)
      expect(memberLines(result, false)[0]).toContain(
        '分数 —（测量无效；未覆盖 1 段：改动上没有变异体）',
      )
    })
  })

  // #649：只因时限到了而超时（没有原因）的，第一遍分不出是负载还是真的挂起，以单独复核的判定为准。
  describe('超时的复核', () => {
    const mutant = (
      id: string,
      status: 'Timeout' | 'Survived' | 'Killed',
      replacement: string,
      extra: { static?: boolean; statusReason?: string } = {},
    ) => ({
      id,
      mutatorName: 'EqualityOperator',
      replacement,
      status,
      location: at(3, 3, 3, 8),
      ...extra,
    })
    const first: MutationReport = {
      files: {
        'src/a.ts': {
          source,
          mutants: [
            mutant('1', 'Timeout', 'a', { static: true }),
            mutant('2', 'Timeout', 'b'),
            mutant('3', 'Timeout', 'c', { statusReason: 'Hit limit reached (501/500)' }),
            mutant('4', 'Killed', 'd'),
          ],
        },
        // 不在要变异的行上：不复核。
        'src/b.ts': {
          source: '',
          mutants: [{ ...mutant('5', 'Timeout', 'e'), location: at(9, 1, 9, 2) }],
        },
      },
    }
    // 复核重新编号，按位置、算子与替换对回；嵌套进来的别的变异体对不上，不计。
    const recheck: MutationReport = {
      files: {
        'src/a.ts': {
          source,
          mutants: [
            mutant('0', 'Survived', 'a', { static: true }),
            mutant('1', 'Timeout', 'b'),
            mutant('2', 'Killed', 'nested'),
          ],
        },
      },
    }

    it('只复核要变异的行上没有原因的超时，mutate 条目精确到列（报告列从 1 起，条目从 0 起）', () => {
      expect(
        recheckTargets(TARGET, first).map(({ file, mutant: m }) => exactEntry(file, m)),
      ).toEqual(['src/a.ts:3:2-3:7', 'src/a.ts:3:2-3:7'])
      expect(recheckTargets(TARGET, first).map(({ mutant: m }) => m.id)).toEqual(['1', '2'])
    })

    it('复核的判定取代第一遍的超时：存活照样记存活，复核又超时算测出；命中次数超限的不用复核', () => {
      const result = summarizeMember(TARGET, first, { recheck })
      expect(result).toMatchObject({ valid: true, invalid: [], score: 75 })
      expect(result.counts).toMatchObject({ Killed: 1, Timeout: 2, Survived: 1 })
      expect(result.rechecked.map(finding => [finding.static, finding.verdict])).toEqual([
        [true, 'Survived'],
        [false, 'Timeout'],
      ])
      expect(memberLines(result, true)).toEqual([
        'packages/core/alpha：变异体 4 个——被杀 1、超时 2、存活 1、无覆盖 0、编译错误 0、运行错误 0，其中复核 2；分数 75%',
        '  存活 packages/core/alpha/src/a.ts:3 EqualityOperator（static） `n > 0` → `a`',
        '  复核 packages/core/alpha/src/a.ts:3 EqualityOperator（static） `n > 0` → `a`：第一遍超时，单独复核判为存活',
        '  复核 packages/core/alpha/src/a.ts:3 EqualityOperator `n > 0` → `b`：第一遍超时，单独复核判为超时',
      ])
    })

    it('没有复核的判定时不计分，成员测量无效、不给分数；第一遍的超时不再算测出', () => {
      const missing: MutationReport = {
        files: {
          'src/a.ts': { source, mutants: [mutant('0', 'Survived', 'a', { static: true })] },
        },
      }
      for (const inputs of [{}, { recheck: missing }]) {
        const result = summarizeMember(TARGET, first, inputs)
        expect(result).toMatchObject({ valid: false, score: null })
        expect(result.counts.Timeout).toBe(1)
        expect(result.invalid.every(finding => finding.reason === 'timeoutUnchecked')).toBe(true)
        expect(memberErrors(result, { logPath: 'run/alpha.log', reports: [] })).toEqual([
          expect.stringMatching(
            /^packages\/core\/alpha：\d 个变异体只因时限到了而超时，没有得到单独复核的判定，没有计分；判为测量无效/u,
          ),
        ])
      }
      expect(summarizeMember(TARGET, first).invalid).toHaveLength(2)
      expect(summarizeMember(TARGET, first, { recheck: missing }).invalid).toHaveLength(1)
      // 复核跑过、却对不上的，指向复核的日志与报告，不指向第一遍的日志。
      const unmatched = memberErrors(summarizeMember(TARGET, first, { recheck: missing }), {
        logPath: 'run/alpha.log',
        reports: ['run/alpha.json', 'run/alpha.recheck.json'],
        recheck: { logPath: 'run/alpha.recheck.log', reportPath: 'run/alpha.recheck.json' },
      })
      expect(unmatched).toEqual([
        expect.stringMatching(
          /复核日志 run\/alpha\.recheck\.log，复核报告 run\/alpha\.recheck\.json$/u,
        ),
      ])
      expect(unmatched[0]).not.toContain('run/alpha.log')
    })

    // 外层变异体（数组、对象字面量、语句块）的精确范围会带上嵌套在里面的变异体一起复跑。
    describe('复核上限', () => {
      const span = (
        id: string,
        mutator: string,
        loc: ReturnType<typeof at>,
        replacement: string,
      ) => ({
        id,
        mutatorName: mutator,
        replacement,
        status: 'Timeout' as const,
        static: true,
        location: loc,
      })
      // 第 3 行：数组 [3:3-3:18] 里嵌套两个字符串 [3:4-3:8]、[3:10-3:14]；三个都超时。另一处 [3:20-3:24] 也超时。
      const nested: MutationReport = {
        files: {
          'src/a.ts': {
            source,
            mutants: [
              span('1', 'ArrayDeclaration', at(3, 3, 3, 18), '[]'),
              span('2', 'StringLiteral', at(3, 4, 3, 8), '""'),
              span('3', 'StringLiteral', at(3, 10, 3, 14), '""'),
              span('4', 'StringLiteral', at(3, 20, 3, 24), '""'),
              // 不超时、却嵌套在数组里的，也会被复跑。
              { ...span('5', 'StringLiteral', at(3, 5, 3, 7), '"x"'), status: 'Survived' as const },
            ],
          },
        },
      }
      const ids = (plan: ReturnType<typeof planRecheck>) => plan.chosen.map(({ mutant: m }) => m.id)

      it('按报告顺序在上限内挑目标；范围里嵌套的变异体计入复跑数，已被盖住的目标不另计', () => {
        const targets = recheckTargets(TARGET, nested)
        expect(targets.map(({ mutant: m }) => m.id)).toEqual(['1', '2', '3', '4'])
        const all = planRecheck(nested, targets, 8)
        expect(ids(all)).toEqual(['1', '2', '3', '4'])
        expect(all.reading).toEqual({
          limit: 8,
          targets: 4,
          skipped: 0,
          mutants: 5,
          allMutants: 5,
        })
        // 数组带上 4 个，再加最后那处超过 4：跳过它。
        const four = planRecheck(nested, targets, 4)
        expect(ids(four)).toEqual(['1', '2', '3'])
        expect(four.reading).toEqual({
          limit: 4,
          targets: 4,
          skipped: 1,
          mutants: 4,
          allMutants: 5,
        })
        // 数组放不下时，挑得下的小目标照样复核；第一个字符串里还嵌套着 5 号，占 2 个。
        const three = planRecheck(nested, targets, 3)
        expect(ids(three)).toEqual(['2', '3'])
        expect(three.reading).toMatchObject({ skipped: 2, mutants: 3 })
        expect(planRecheck(nested, targets, 0).reading).toMatchObject({ skipped: 4, mutants: 0 })
      })

      it('超出上限的目标记超时未复核，成员测量无效；出错信息写明上限、全部复核的数目与怎么调', () => {
        const targets = recheckTargets(TARGET, nested)
        const plan = planRecheck(nested, targets, 0)
        const result = summarizeMember(TARGET, nested, { recheckReading: plan.reading })
        expect(result).toMatchObject({ valid: false, score: null, recheck: plan.reading })
        expect(
          result.invalid.filter(finding => finding.reason === 'timeoutUnchecked'),
        ).toHaveLength(4)
        expect(memberErrors(result, { logPath: 'run/alpha.log', reports: [] })).toEqual([
          'packages/core/alpha：4 个只因时限到了而超时的变异体超出复核上限，没有复核，没有计分：' +
            '上限是每个成员复跑 0 个变异体（含复核范围里嵌套的），全部复核要复跑 5 个；判为测量无效。' +
            '调大 test-runs.config.json 的 mutation.recheckMaxMutants 或设环境变量 OMNE_MUTATION_RECHECK_MAX 后复跑，或缩小变异范围',
        ])
      })
    })
  })

  it('类型测试：初跑跑了、static 变异体的运行没跑的次数单列，不影响判定（#649）', () => {
    const staticReport: MutationReport = {
      files: {
        'src/a.ts': {
          source,
          mutants: [
            {
              id: '1',
              mutatorName: 'M',
              status: 'Survived',
              static: true,
              location: at(3, 3, 3, 8),
            },
            {
              id: '2',
              mutatorName: 'M',
              status: 'Survived',
              static: true,
              location: at(3, 3, 3, 8),
            },
            { id: '3', mutatorName: 'M', status: 'Killed', location: at(3, 3, 3, 8) },
          ],
        },
      },
    }
    const run = (mode: string, typeTests: number, activeMutant?: string) => ({
      mode,
      typeTests,
      typecheck: true,
      ...(activeMutant === undefined ? {} : { activeMutant }),
    })
    const runs = [
      run('dry-run', 2),
      run('mutant', 0, '1'),
      run('mutant', 2, '2'),
      run('mutant', 0, '3'),
    ]
    const result = summarizeMember(TARGET, staticReport, { runs })
    expect(result.typeTests).toEqual({
      status: 'measured',
      dryRun: 2,
      staticRuns: 2,
      withoutTypeTests: 1,
    })
    expect(result.valid).toBe(true)
    expect(memberLines(result, false)[1]).toBe(
      '  类型测试：初跑 2 项；static 变异体的运行 2 次，其中 1 次没有跑类型测试（上游复用 Vitest 实例，类型测试不随变异体改变结果）',
    )
    // 测到了、没有缺席：照样写一行，与没测到分开。
    const allRan = summarizeMember(TARGET, staticReport, {
      runs: [run('dry-run', 2), run('mutant', 2, '1')],
    })
    expect(allRan.typeTests).toMatchObject({ status: 'measured', withoutTypeTests: 0 })
    expect(memberLines(allRan, false)[1]).toBe(
      '  类型测试：初跑 2 项；static 变异体的运行 1 次，都跑了类型测试',
    )
    // 没测到：记录读不出、记录类型测试时出错、没有初跑的记录、类型检查开着却没数到。
    const notMeasured = (runs: SummaryInputs['runs']) =>
      summarizeMember(TARGET, staticReport, runs === undefined ? {} : { runs }).typeTests
    expect(notMeasured('unreadable')).toEqual({ status: 'notMeasured', reason: '运行记录读不出' })
    expect(notMeasured([{ mode: 'dry-run', error: 'state is gone' }])).toEqual({
      status: 'notMeasured',
      reason: '记录类型测试时出错：state is gone',
    })
    expect(notMeasured([run('mutant', 0, '1')])).toMatchObject({ status: 'notMeasured' })
    expect(notMeasured([run('dry-run', 0)])).toMatchObject({
      status: 'notMeasured',
      reason: expect.stringContaining('初跑却没数到类型测试'),
    })
    const unread = summarizeMember(TARGET, staticReport, { runs: 'unreadable' })
    expect(unread.valid).toBe(true)
    expect(memberLines(unread, false)[1]).toBe(
      '  类型测试：没测到，static 运行中有没有缺席不明（运行记录读不出）',
    )
    // 类型检查没开：不适用。
    expect(notMeasured([{ mode: 'dry-run', typeTests: 0, typecheck: false }])).toBeNull()
    expect(summarizeMember(TARGET, staticReport).typeTests).toBeNull()
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

  it('复核（#649）：只变异给定位置，一个工作进程，时限加 timeoutMS，报告与 sandbox 与第一遍分开', () => {
    const run = {
      root: '/repo',
      runDir: '/out',
      concurrency: 3,
      testTimeoutSeconds: 60,
      nonce: '7',
    }
    const first = strykerConfig(TARGET, run)
    expect(first).not.toHaveProperty('timeoutMS')
    expect(
      strykerConfig(TARGET, run, { mutate: ['src/a.ts:3:2-3:7'], timeoutMS: 60_000 }),
    ).toMatchObject({
      mutate: ['src/a.ts:3:2-3:7'],
      concurrency: 1,
      timeoutMS: 60_000,
      tempDirName: '/repo/packages/.stryker-tmp-packages__core__alpha-7-recheck',
      jsonReporter: { fileName: '/out/packages__core__alpha.recheck.mutation.json' },
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
  // 归慢层：起变异入口 CLI 子进程。快层账本里这条 2.7／7.1 秒，超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it('--base、--plan 与 --members 只能给一个；不是产品成员的拒绝', { tags: ['slow'] }, () => {
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

  // 归慢层：在临时 git 仓库里起变异入口 CLI 子进程。快层账本里这条 2.2／5.8 秒，超过单条预算 2.5 秒（tools/test-runner/README_ZH.md「归层」）。
  it(
    '--plan 读准入检查的计划：变异计划里的成员；有计划外的改动、或计划不是当前提交算的就拒绝',
    { tags: ['slow'] },
    () => {
      const root = cliFixture()
      writeFileSync(join(root, 'packages/core/canary/src/index.ts'), 'export const value = 2\n')
      const head = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
      const planFile = (test: string[], at = head) => writePlan(at, head, test)
      const selected = cliAt(
        root,
        'run',
        '--plan',
        planFile(['packages/core/canary']),
        '--plan-only',
      )
      expect(selected.status, selected.stderr).toBe(0)
      expect(selected.stdout).toMatch(/packages\/core\/canary：1 个文件/u)
      // 计划算完后工作树又改了计划外的成员：不静默跳过，要求重算。
      const outside = cliAt(root, 'run', '--plan', planFile([]), '--plan-only')
      expect(outside.status).toBe(2)
      expect(outside.stderr).toContain('计划外的成员：packages/core/canary')
      const stale = cliAt(root, 'run', '--plan', planFile([], '0'.repeat(40)), '--plan-only')
      expect(stale.status).toBe(2)
      expect(stale.stderr).toContain('重新算计划')
    },
  )
})

// 真起 Stryker：一次约十几到几十秒，归慢层。
describe('夹具项目上真起 Stryker', { tags: ['slow'] }, () => {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  /** 一个只有一个成员的仓库：依赖链接到本次安装的包，编译器入口可随成员搬进 sandbox。 */
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

  it('搬移后的成员与 sandbox 真跑类型检查，错误类型断言仍失败', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'tsconfig.test.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: 'nodenext',
          target: 'es2022',
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['tests/**/*.spec-d.ts'],
      }),
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec-d.ts'),
      "import { expectTypeOf, test } from 'vitest'\ntest('number type', () => { expectTypeOf(1).toEqualTypeOf<number>() })\n",
    )
    const sandbox = join(root, 'packages/core/sandbox')
    cpSync(memberDir, sandbox, {
      recursive: true,
      filter: path => path !== join(memberDir, 'node_modules'),
    })
    symlinkSync(join(memberDir, 'node_modules'), join(sandbox, 'node_modules'), 'dir')
    const check = (cwd: string) =>
      spawnSync(
        process.execPath,
        [
          join(cwd, 'node_modules/vitest/vitest.mjs'),
          'run',
          '--mode',
          'fast',
          '--maxWorkers',
          '1',
          '--typecheck.enabled=true',
          '--typecheck.include',
          'tests/**/*.spec-d.ts',
          '--typecheck.tsconfig',
          'tsconfig.test.json',
        ],
        // turbo 的严格环境模式下子进程会上色，颜色码插进摘要行使正则失配：显式关掉颜色。
        {
          cwd,
          encoding: 'utf8',
          timeout: 30_000,
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined },
        },
      )
    for (const cwd of [memberDir, sandbox]) {
      const ran = check(cwd)
      expect(ran.status, `${ran.stdout}${ran.stderr}`).toBe(0)
      expect(ran.stdout).toMatch(/Tests\s+2 passed/u)
      expect(ran.stdout).toMatch(/Type Errors\s+no errors/u)
      expect(`${ran.stdout}${ran.stderr}`).not.toContain('Unhandled Error')
    }
    writeFileSync(
      join(sandbox, 'tests/sign.spec-d.ts'),
      "import { expectTypeOf, test } from 'vitest'\ntest('wrong type', () => { expectTypeOf(1).toEqualTypeOf<string>() })\n",
    )
    const wrong = check(sandbox)
    expect(wrong.status, `${wrong.stdout}${wrong.stderr}`).toBe(1)
    expect(wrong.stderr).toContain('TypeCheckError')
    expect(wrong.stdout).toMatch(/Type Errors\s+1 failed/u)
  })

  /** 夹具没有本仓库的影响面规则，现算不出计划：手写一份只选这个成员的计划，走准入检查读计划的路径。 */
  function mutate(root: string, out: string, workers = '2', env: Record<string, string> = {}) {
    const head = git(root, 'rev-parse', 'HEAD').trim()
    const planPath = writePlan(head, head, ['packages/core/sign'])
    const ran = spawnSync(
      process.execPath,
      ['--experimental-strip-types', CLI, 'run', '--root', root, '--plan', planPath, '--out', out],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          BASELINE: undefined,
          VITEST_MAX_WORKERS: workers,
          OMNE_MUTATION_RECHECK_MAX: undefined,
          ...env,
        },
      },
    )
    const summary = existsSync(join(out, 'summary.json'))
      ? (JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) as {
          members: {
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
        })
      : undefined
    return { ran, summary }
  }

  it('改动只落在 as const 声明上：Stryker 不生成变异体，读数报未覆盖并列出改动行，不报分数（#737）', () => {
    const { root, memberDir } = fixture()
    writeFileSync(
      join(memberDir, 'src/sign.ts'),
      "export const zero = 0\nexport const NAMES = ['a', 'b'] as const\n",
    )
    writeFileSync(
      join(memberDir, 'tests/sign.spec.ts'),
      [
        "import { NAMES, zero } from '../src/sign.ts'",
        "test('zero', () => { expect(zero).toBe(0) })",
        "test('names', () => { expect(NAMES).toEqual(['a', 'b']) })",
      ].join('\n'),
    )
    const out = join(root, 'out-const')
    const result = mutate(root, out)
    const output = `${result.ran.stdout}${result.ran.stderr}`
    expect(result.ran.status, output).toBe(0)
    expect(result.summary?.errors).toEqual([])
    const [only] = result.summary?.members ?? []
    expect(only).toMatchObject({
      valid: true,
      score: null,
      unmutated: [{ file: 'packages/core/sign/src/sign.ts', start: 2, end: 2 }],
    })
    const summary = readFileSync(join(out, 'summary.md'), 'utf8')
    expect(summary).toContain('分数 —（未覆盖 1 段：改动上没有变异体）')
    expect(summary).toContain('  没有变异体 packages/core/sign/src/sign.ts:2')
    expect(summary).not.toContain('100%')
    // 逐成员的进度行同样报出段数。
    expect(result.ran.stdout).toMatch(/\[1\/1\] packages\/core\/sign .*、没有变异体的改动 1 段/u)
  })

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

  // Vitest 只在一个实例第一次运行时报告类型测试；上游 runner 在同一工作进程里复用实例，初跑之后的 static 运行就少了它们。
  // 类型测试不随变异体改变结果，读数单列缺席的次数，不改判定（#649）。
  it('static 变异体的运行没跑类型测试时读数写明缺席；没有断言守着的照样记为存活（#649）', () => {
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
    // 一个工作进程：static 变异体落在跑过初跑的那个进程里，类型测试必然缺席。
    const ran = mutate(root, join(root, 'out'), '1')
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
    expect(ran.summary?.errors).toEqual([])
    const [member] = ran.summary?.members ?? []
    expect(member?.survived.map(finding => finding.line)).toEqual([2])
    expect(member?.typeTests).toEqual({
      status: 'measured',
      dryRun: 1,
      staticRuns: 1,
      withoutTypeTests: 1,
    })
    expect(ran.ran.stdout).toContain('其中 1 次没有跑类型测试')
  })

  it('static 运行只因负载超过时限时，单独复核后按真实判定计分：存活不被记成测出（#649）', () => {
    const { root, memberDir } = staticFixture()
    // 可控的耗时注入：不导入源码，只有跑全部测试的 static 运行会跑它；只在有变异体激活时等待，初跑不受影响，
    // 时限就按快的初跑估出，第一遍必然超过。复核的时限另加 mutation.testTimeoutSeconds，20 秒跑得完。
    writeFileSync(
      join(memberDir, 'tests/delay.spec.ts'),
      [
        "test('slow only under an active mutant', async () => {",
        '  if ((globalThis as { __stryker__?: { activeMutant?: string } }).__stryker__?.activeMutant !== undefined)',
        '    await new Promise(resolve => setTimeout(resolve, 20_000))',
        '}, 120_000)',
      ].join('\n'),
    )
    const out = join(root, 'out')
    const ran = mutate(root, out)
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
    expect(ran.summary?.errors).toEqual([])
    const [member] = ran.summary?.members ?? []
    expect(member).toMatchObject({ valid: true, invalid: [] })
    expect(member?.rechecked).toEqual([
      expect.objectContaining({ line: 2, static: true, verdict: 'Survived' }),
    ])
    expect(member?.counts['Timeout']).toBe(0)
    expect(member?.survived.map(finding => finding.line)).toEqual([2])
    // 非 static 的变异体照常计分。
    expect(member?.counts['Killed']).toBeGreaterThan(0)
    const first = JSON.parse(readFileSync(join(out, 'packages__core__sign.mutation.json'), 'utf8'))
    expect(first).toMatchObject({
      files: {
        'src/sign.ts': {
          mutants: expect.arrayContaining([
            expect.objectContaining({ status: 'Timeout', static: true }),
          ]),
        },
      },
    })
  })

  it('复核上限为 0 时不复核：超时记超时未复核，成员测量无效，退出 1，信息写明怎么调（#649）', () => {
    const { root, memberDir } = staticFixture()
    writeFileSync(
      join(memberDir, 'tests/delay.spec.ts'),
      [
        "test('slow only under an active mutant', async () => {",
        '  if ((globalThis as { __stryker__?: { activeMutant?: string } }).__stryker__?.activeMutant !== undefined)',
        '    await new Promise(resolve => setTimeout(resolve, 20_000))',
        '}, 120_000)',
      ].join('\n'),
    )
    const out = join(root, 'out')
    const ran = mutate(root, out, '2', { OMNE_MUTATION_RECHECK_MAX: '0' })
    expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(1)
    const [member] = ran.summary?.members ?? []
    expect(member).toMatchObject({
      valid: false,
      score: null,
      recheck: { limit: 0, targets: 1, skipped: 1, mutants: 0, allMutants: 1 },
    })
    expect(member?.invalid).toEqual([
      expect.objectContaining({ line: 2, reason: 'timeoutUnchecked' }),
    ])
    expect(ran.summary?.errors).toEqual([expect.stringContaining('OMNE_MUTATION_RECHECK_MAX')])
    expect(existsSync(join(out, 'packages__core__sign.recheck.mutation.json'))).toBe(false)
  })

  // 变异体在模块加载时把步长算成 0，测试里的循环停不下来；循环本身不经过变异体，命中次数超限判不出，只能时限到了。
  it(
    '真的挂起的 static 变异体复核仍超时，算测出来，不判测量无效（#649）',
    { timeout: 300_000 },
    () => {
      const { root, memberDir } = fixture()
      const body = (step: string) =>
        `export const zero = 0\nexport const STEP = ${step}\nexport function count(n: number): number {\n  let c = 0\n  for (let i = 0; i < n; i += STEP) c += 1\n  return c\n}\n`
      writeFileSync(join(memberDir, 'src/sign.ts'), body('1'))
      writeFileSync(
        join(memberDir, 'tests/sign.spec.ts'),
        "import { count } from '../src/sign.ts'\ntest('count', () => { expect(count(3)).toBe(3) })\n",
      )
      git(root, 'add', '.')
      git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'count')
      writeFileSync(join(memberDir, 'src/sign.ts'), body('Math.max(1, zero)'))
      const ran = mutate(root, join(root, 'out'), '1')
      expect(ran.ran.status, `${ran.ran.stdout}${ran.ran.stderr}`).toBe(0)
      expect(ran.summary?.errors).toEqual([])
      const [member] = ran.summary?.members ?? []
      expect(member).toMatchObject({ valid: true, invalid: [] })
      expect(member?.rechecked).toEqual([
        expect.objectContaining({ line: 2, static: true, verdict: 'Timeout' }),
      ])
      expect(member?.counts['Timeout']).toBe(1)
    },
  )

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
      // 测量无效的成员照样留在读数里，不给分数（#649）。
      expect(invalid.summary?.members).toEqual([
        expect.objectContaining({ valid: false, score: null }),
      ])
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
