// 差分变异的纯函数部分：范围（改动行 → 各成员的 mutate 条目）、报告汇总、sandbox 的位置与 Stryker 配置。
// 入口的参数见 mutation-cli.spec.ts，夹具项目上真起 Stryker 的见 mutation-stryker-*.spec.ts。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDiff } from '@omne-harness/repo-toolchain/core/git'
import {
  memberLines,
  exactEntry,
  memberErrors,
  planRecheck,
  recheckTargets,
  summarizeMember,
  type MutationReport,
  type ReportMutant,
  type SummaryInputs,
} from '../src/mutation/report.ts'
import {
  changedTargets,
  memberTargets,
  mutateEntries,
  type MutationTarget,
} from '../src/mutation/scope.ts'
import { sandboxContainer, strykerConfig } from '../src/mutation/stryker.ts'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import { temporary } from './fixtures/mutation.ts'

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

  it('报告里的变异体按跑完的先后排；读数按生成的先后（id）列，与跑完的先后无关', () => {
    const mutants = (report.files['src/a.ts']?.mutants ?? []).slice(0, 4)
    const survivors = (ordered: readonly ReportMutant[]): MutationReport => ({
      files: {
        'src/a.ts': {
          source,
          mutants: ordered.map(mutant => ({ ...mutant, status: 'Survived' as const })),
        },
      },
    })
    const forward = summarizeMember(TARGET, survivors(mutants))
    expect(summarizeMember(TARGET, survivors(mutants.toReversed()))).toEqual(forward)
    // 按行排；同一行上的按 id。
    expect(forward.survived.map(finding => finding.mutator)).toEqual([
      'ArrowFunction',
      'EqualityOperator',
      'ConditionalExpression',
      'StringLiteral',
    ])
  })

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
        expect(all.reading).toEqual({ limit: 8, targets: 4, skipped: 0, mutants: 5, allMutants: 5 })
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

// 路径期望经 path.join 写成本机分隔符（Windows 上是反斜杠），结构与 POSIX 上相同。
describe('sandbox 与配置', () => {
  it('sandbox 与成员同深度：容器在成员的上两级，Stryker 在容器下再建一层', () => {
    for (const path of ['packages/core/alpha', 'apps/cli']) {
      const sandbox = join(sandboxContainer('/repo', path, '7'), 'sandbox-abc')
      expect(relative('/repo', sandbox).split(sep)).toHaveLength(path.split('/').length)
    }
    expect(sandboxContainer('/repo', 'packages/core/alpha', '7')).toBe(
      join('/repo/packages/.stryker-tmp-packages__core__alpha-7'),
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
      tempDirName: join('/repo/packages/.stryker-tmp-packages__core__alpha-7'),
      concurrency: 3,
      jsonReporter: { fileName: join('/out/packages__core__alpha.mutation.json') },
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
      tempDirName: join('/repo/packages/.stryker-tmp-packages__core__alpha-7-recheck'),
      jsonReporter: { fileName: join('/out/packages__core__alpha.recheck.mutation.json') },
    })
  })
})
