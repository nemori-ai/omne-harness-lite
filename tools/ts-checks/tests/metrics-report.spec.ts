// 报告组装的已知值核对：CRAP 公式、变更判定、覆盖率三态、摘要行数上限、审讯页自包含。
import { statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { SourceFile } from '../src/index.ts'
import { lineHitsFrom } from '../src/metrics/coverage.ts'
import { coordinates, parseDiff, shapeOf, touches } from '../src/metrics/git.ts'
import { renderPage } from '../src/metrics/render.ts'
import {
  bandOf,
  barycenterOrder,
  buildReport,
  crap,
  gradeOf,
  levelOf,
  spread,
  summaryLines,
  type CoverageInput,
} from '../src/metrics/report.ts'
import { GROUP_DIRECTION_POLICY } from '../src/rules/group-direction.ts'

const thresholds = { warn: 10, alert: 12 }
const bands = { green: 8, yellow: 12, red: 20 }
const file = (path: string, text: string): SourceFile => ({ path, text })

// 第 1 行起：simple 占 1 行；tangled 占第 2～9 行，圈复杂度 5。
const SOURCE = `export function simple() { return 1 }
export function tangled(a: number, b: number) {
  if (a > 0) return 1
  if (b > 0) return 2
  if (a > b) return 3
  if (a < b) return 4
  return 0
}
`
const storage = file('packages/core/storage/src/index.ts', SOURCE)
const consumer = file(
  'packages/tenancy/account-identity/src/index.ts',
  "import { simple } from '@omne-harness-lite/storage'\nexport const x = simple()\n",
)
const base = { files: [storage, consumer], policy: GROUP_DIRECTION_POLICY, thresholds, bands }

describe('crap 与评级', () => {
  it('CRAP = CC² × (1 − 覆盖率)³ + CC', () => {
    expect(crap(5, 1)).toBe(5)
    expect(crap(5, 0)).toBe(30)
    expect(crap(10, 0.5)).toBe(22.5)
  })

  it('超过 alert 为 alert，超过 warn 为 warn，等于阈值不算超', () => {
    expect(levelOf(10, thresholds)).toBe('ok')
    expect(levelOf(10.1, thresholds)).toBe('warn')
    expect(levelOf(12, thresholds)).toBe('warn')
    expect(levelOf(12.1, thresholds)).toBe('alert')
  })

  it('评分在色带点上分段线性：8 以下 10 分，12 为 5.5 分，20 及以上 1 分', () => {
    expect(gradeOf(3, bands)).toBe(10)
    expect(gradeOf(8, bands)).toBe(10)
    expect(gradeOf(10, bands)).toBeCloseTo(7.75)
    expect(gradeOf(12, bands)).toBe(5.5)
    expect(gradeOf(16, bands)).toBeCloseTo(3.25)
    expect(gradeOf(20, bands)).toBe(1)
    expect(gradeOf(137, bands)).toBe(1)
    expect([8, 8.1, 12, 12.1].map(risk => bandOf(risk, bands))).toEqual([
      'green',
      'yellow',
      'yellow',
      'red',
    ])
  })

  it('均值、总体标准差与最大值各四舍五入到 0.1；风险值是两者之和', () => {
    // 2、4、4、4、5、5、7、9：均值 5，总体标准差 2（样本标准差约 2.14）。
    expect(spread([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ mu: 5, sigma: 2, max: 9, risk: 7 })
    expect(spread([])).toEqual({ mu: 0, sigma: 0, max: 0, risk: 0 })
  })
})

describe('barycenterOrder', () => {
  it('按无向邻居位置的平均值把相连的节点拉到一起，只在段内重排', () => {
    const neighbors = new Map([
      ['a', new Set(['y'])],
      ['b', new Set(['x'])],
      ['x', new Set(['b'])],
      ['y', new Set(['a'])],
    ])
    // 初始 a–y、b–x 两条线交叉。第一轮先排上一行：a 的邻居 y 在 80、b 的邻居 x 在 0，于是 b 排到 a 前面；
    // 再排下一行时 x 的邻居 b 已在 0、y 的邻居 a 在 80，顺序不动。结果 b 在 x 正上方、a 在 y 正上方。
    expect(barycenterOrder([[['a', 'b']], [['x', 'y']]], neighbors)).toEqual([
      [['b', 'a']],
      [['x', 'y']],
    ])
    // 两段各自重排，节点不跨段。
    expect(barycenterOrder([[['a', 'b']], [['x'], ['y']]], neighbors)).toEqual([
      [['b', 'a']],
      [['x'], ['y']],
    ])
  })

  it('没有邻居的节点留在原位，排序稳定', () => {
    expect(barycenterOrder([[['c', 'a', 'b']]], new Map())).toEqual([[['c', 'a', 'b']]])
  })
})

describe('git 辅助', () => {
  it('parseDiff 取新一侧的行区间；纯删除也记一行；删除的文件不计', () => {
    const diff = [
      'diff --git a/packages/a.ts b/packages/a.ts',
      '--- a/packages/a.ts',
      '+++ b/packages/a.ts',
      '@@ -3,0 +4,2 @@ ctx',
      '+x',
      '+y',
      '@@ -10,2 +12,0 @@',
      '@@ -20 +21 @@',
      'diff --git a/packages/gone.ts b/packages/gone.ts',
      '--- a/packages/gone.ts',
      '+++ /dev/null',
      '@@ -1,3 +0,0 @@',
    ].join('\n')
    expect([...parseDiff(diff)]).toEqual([
      [
        'packages/a.ts',
        [
          [4, 5],
          [12, 12],
          [21, 21],
        ],
      ],
    ])
  })

  it('touches 判区间相交；shapeOf 给提交数、中位与最大', () => {
    expect(touches([[4, 5]], 5, 9)).toBe(true)
    expect(touches([[4, 5]], 6, 9)).toBe(false)
    expect(shapeOf([3, 40, 5])).toEqual({ commits: 3, medianFiles: 5, maxFiles: 40 })
    expect(shapeOf([])).toEqual({ commits: 0, medianFiles: 0, maxFiles: 0 })
  })

  it('真实仓库：主检出根是一个存在的绝对目录，里面有 Git 目录（工作树里也指回主检出）', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const at = coordinates(root, undefined)
    expect(isAbsolute(at.mainRoot)).toBe(true)
    expect(statSync(join(at.mainRoot, '.git')).isDirectory()).toBe(true)
    expect(at.shortHead).toMatch(/^[0-9a-f]{9}$/u)
  })
})

describe('buildReport', () => {
  it('没有覆盖率时按圈复杂度评级，不给 CRAP', () => {
    const report = buildReport(base)
    const tangled = report.functions.find(row => row.name === 'tangled')
    expect(tangled).toMatchObject({ complexity: 5, score: 5, level: 'ok', changed: false })
    expect(tangled).not.toHaveProperty('crap')
    expect(report.coverageEnabled).toBe(false)
    expect(report.edges).toMatchObject([
      {
        from: 'packages/tenancy/account-identity',
        to: 'packages/core/storage',
        count: 1,
        violating: false,
      },
    ])
  })

  it('没有基线文本时退回行号判定：变更行落在函数范围内才算变更；成员随之标记', () => {
    const report = buildReport({
      ...base,
      changed: new Map([[storage.path, [[4, 4] as const]]]),
    })
    expect(report.functions.filter(row => row.changed).map(row => row.name)).toEqual(['tangled'])
    expect(report.members.map(member => [member.path, member.changed])).toEqual([
      ['packages/core/storage', true],
      ['packages/tenancy/account-identity', false],
    ])
  })

  it('有基线文本时按函数文本判：文件头插入一行使所有行号都变了，但只有文本变了的函数算变更', () => {
    const baseText = SOURCE.replace('return 3', 'return 33')
    const now = file(storage.path, `// 新加的文件头\n${SOURCE}`)
    const report = buildReport({
      ...base,
      files: [now, consumer],
      changed: new Map([[storage.path, [[1, 1] as const, [6, 6] as const]]]),
      baseTexts: new Map([[storage.path, baseText]]),
    })
    expect(report.functions.filter(row => row.changed).map(row => row.name)).toEqual(['tangled'])
    const fresh = buildReport({
      ...base,
      changed: new Map([[storage.path, [[1, Number.POSITIVE_INFINITY] as const]]]),
      baseTexts: new Map([[storage.path, undefined]]),
    })
    expect(fresh.functions.filter(row => row.changed).map(row => row.name)).toEqual([
      'simple',
      'tangled',
    ])
  })

  it('成员带均值、标准差、风险值与色带；扇入扇出与不稳定度；布局按层给出', () => {
    const report = buildReport(base)
    const [core, tenancy] = report.members
    // simple 1 分、tangled 5 分：均值 3，总体标准差 2。
    expect(core).toMatchObject({ mu: 3, sigma: 2, max: 5, risk: 5, band: 'green', grade: 10 })
    expect(core).toMatchObject({ fanIn: 1, fanOut: 0, instability: 0 })
    expect(tenancy).toMatchObject({ fanIn: 0, fanOut: 1, instability: 1 })
    expect(report.layout.map(layer => layer.map(group => [group.group, group.members]))).toEqual([
      [['packages/core', ['packages/core/storage']]],
      [['packages/tenancy', ['packages/tenancy/account-identity']]],
      [],
    ])
  })

  it('有覆盖率：按函数行范围求命中比例并算 CRAP；一条没命中的成员判缺数据', () => {
    const hits = new Map([
      [1, true],
      [3, true],
      [4, false],
      [5, false],
      [6, false],
      [7, false],
    ])
    const coverage: CoverageInput = {
      files: new Map([
        [storage.path, hits],
        [consumer.path, new Map([[2, false]])],
      ]),
      members: new Map([
        ['packages/core/storage', 0],
        ['packages/tenancy/account-identity', 1],
      ]),
      staleDist: [],
    }
    const report = buildReport({ ...base, coverage })
    const tangled = report.functions.find(row => row.name === 'tangled')
    expect(tangled?.coverage).toBeCloseTo(0.2)
    expect(tangled?.crap).toBeCloseTo(25 * 0.8 ** 3 + 5)
    expect(tangled?.level).toBe('alert')
    expect(report.members.map(member => member.coverage)).toEqual(['measured', 'no-data'])
    expect(report.functions.find(row => row.member.endsWith('account-identity'))).toBeUndefined()
    expect(report.failedTests).toEqual(['packages/tenancy/account-identity'])
  })
})

describe('lineHitsFrom', () => {
  it('把 istanbul 形状按语句起始行折成行命中，路径归一为仓库相对', () => {
    const hits = lineHitsFrom(
      {
        '/repo/packages/core/storage/src/a.ts': {
          statementMap: {
            '0': { start: { line: 1 } },
            '1': { start: { line: 1 } },
            '2': { start: { line: 3 } },
          },
          s: { '0': 0, '1': 2, '2': 0 },
        },
      },
      '/repo',
    )
    expect([...(hits.get('packages/core/storage/src/a.ts') ?? [])]).toEqual([
      [1, true],
      [3, false],
    ])
  })
})

describe('摘要与审讯页', () => {
  const many = Array.from({ length: 9 }, (_, index) =>
    file(
      `packages/core/storage/src/f${index}.ts`,
      `export function f${index}(a: number) {\n${'  if (a) return 1\n'.repeat(13 + index)}  return 0\n}\n`,
    ),
  )
  const report = buildReport({
    ...base,
    files: [...base.files, ...many],
    changed: new Map(many.map(item => [item.path, [[1, 99] as const]])),
    commits: { commits: 2, medianFiles: 4, maxFiles: 9 },
  })
  const context = {
    shortHead: 'abc123def',
    branch: 'panqiwei/x',
    dirty: false,
    baseRef: 'main',
    reviewPath: '/repo/tmp/metrics/abc123def/review.html',
    top: 5,
  }

  it('摘要不超过 12 行，只逐条列变更函数里超阈值的前几个，按分数从高到低', () => {
    const lines = summaryLines(report, context)
    expect(lines.length).toBeLessThanOrEqual(12)
    expect(lines[0]).toContain('abc123def')
    expect(lines[1]).toContain('提交 2 个')
    expect(lines.filter(line => line.startsWith('  '))).toHaveLength(5)
    expect(lines.find(line => line.startsWith('  '))).toContain('f8 CC 22')
    expect(lines.at(-1)).toBe(`审讯页：${context.reviewPath}`)
  })

  it('审讯页自包含：数据内联、无外部资源，内联数据不含可提前闭合脚本的字符', () => {
    const tricky = buildReport({
      ...base,
      files: [
        file('packages/core/storage/src/t.ts', 'export const obj = { "</script>": () => 1 }\n'),
      ],
    })
    const html = renderPage(tricky, {
      head: 'abc',
      shortHead: 'abc',
      branch: 'b',
      dirty: true,
      generatedAt: '2026-10-01T00:00:00.000Z',
      summary: ['一行 <b>'],
      changedEdgeLimit: 24,
    })
    expect(html).toContain('"page":{"changedEdgeLimit":24}')
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3\.org)/u)
    expect(html.match(/<\/script>/gu)).toHaveLength(2)
    expect(html).toContain('一行 &lt;b&gt;')
    expect(html).toContain('工作树不干净')
  })
})
