// 报告组装。着色评分、汇总规则、行内排序与依赖度量照 Robert C. Martin 的工具按其逻辑重写
// （原仓库无许可证，不搬原文），出处逐处标注；与原实现的有意差异也在标注处说明。
import { isTestPath, type SourceFile } from '../rule.ts'
import { functionMetrics, nestedUnits, unitDigests } from './complexity.ts'
import { touches, type ChangedLines, type CommitShape } from './git.ts'
import {
  evaluateDirection,
  memberGraph,
  memberOf,
  type DirectionFinding,
  type GroupDirectionPolicy,
  type ImportSite,
  type MemberGraph,
} from './graph.ts'

/** 函数级的「要解释」线：超过 warn 列入清单，超过 alert 另计。 */
export interface Thresholds {
  readonly warn: number
  readonly alert: number
}

/** 成员着色的色带：风险值不超过 green 为绿，到 yellow 过渡为黄，到 red 及以上为红。 */
export interface Bands {
  readonly green: number
  readonly yellow: number
  readonly red: number
}

export type Level = 'ok' | 'warn' | 'alert'
export type Band = 'green' | 'yellow' | 'red'

/** 一个文件里各行的命中：有可执行语句的行 → 是否执行过。 */
export type LineHits = ReadonlyMap<number, boolean>

/** 覆盖率层的输入；没有跑覆盖率时整体缺席。 */
export interface CoverageInput {
  /** 仓库相对路径 → 行命中。 */
  readonly files: ReadonlyMap<string, LineHits>
  /** 成员路径 → 测试进程退出码；没有跑的成员不在其中。 */
  readonly members: ReadonlyMap<string, number>
  /** dist 早于源码的成员：映射回源码的行号可能对不上。 */
  readonly staleDist: readonly string[]
}

export interface FunctionRow {
  readonly path: string
  readonly member: string
  readonly name: string
  readonly line: number
  readonly endLine: number
  readonly complexity: number
  /** 0 到 1；没有覆盖率数据或函数里没有可执行语句时缺席。 */
  readonly coverage?: number
  /** 只在有覆盖率时给出。 */
  readonly crap?: number
  /** 评级用的分数：有 CRAP 用 CRAP，否则用圈复杂度。 */
  readonly score: number
  readonly level: Level
  /** 1（最差）到 10（最好），着色用。 */
  readonly grade: number
  readonly changed: boolean
}

export interface MemberRow {
  readonly path: string
  readonly group: string
  readonly layer: number
  readonly functions: number
  /** 函数评级分的均值、总体标准差与最大值，各自四舍五入到 0.1。 */
  readonly mu: number
  readonly sigma: number
  readonly max: number
  /** 风险值 = 均值 + 标准差；着色按它，单个最差函数不至于把整个成员染红。 */
  readonly risk: number
  readonly grade: number
  readonly band: Band
  readonly overWarn: number
  readonly overAlert: number
  readonly changed: boolean
  /** 基线以来变更的函数里超过 warn 的个数。 */
  readonly changedOver: number
  /** measured：有行命中数据；no-data：跑了测试但没有命中本包源码；not-run：没跑。 */
  readonly coverage: 'measured' | 'no-data' | 'not-run'
  /** 语句行命中比例，只在 measured 时给出。 */
  readonly lineCoverage?: number
  /** 依赖它的成员数、它依赖的成员数，与不稳定度 出 /（入 + 出）。 */
  readonly fanIn: number
  readonly fanOut: number
  readonly instability: number
}

export interface EdgeRow {
  readonly from: string
  readonly to: string
  readonly count: number
  readonly sites: readonly ImportSite[]
  readonly violating: boolean
  readonly excepted: boolean
  /** 有导入处落在基线以来改动的行里。 */
  readonly changed: boolean
}

export interface GroupRow {
  readonly group: string
  /** 组内最差成员的风险值与评分。 */
  readonly risk: number
  readonly grade: number
  /** 成员路径，已按行内排序排好。 */
  readonly members: readonly string[]
}

export interface Report {
  readonly thresholds: Thresholds
  readonly bands: Bands
  readonly coverageEnabled: boolean
  readonly hasBase: boolean
  /** 下标即层号，0 为最内层；每层的组已按行内排序排好。 */
  readonly layout: readonly (readonly GroupRow[])[]
  readonly members: readonly MemberRow[]
  readonly functions: readonly FunctionRow[]
  readonly edges: readonly EdgeRow[]
  readonly findings: readonly DirectionFinding[]
  readonly exceptions: GroupDirectionPolicy['exceptions']
  readonly commits?: CommitShape
  /** 覆盖率那一趟里测试退出码非零的成员。度量照出，测试结论另算。 */
  readonly failedTests: readonly string[]
  readonly staleDist: readonly string[]
}

export function crap(complexity: number, coverage: number): number {
  return complexity * complexity * (1 - coverage) ** 3 + complexity
}

export function levelOf(score: number, thresholds: Thresholds): Level {
  if (score > thresholds.alert) return 'alert'
  return score > thresholds.warn ? 'warn' : 'ok'
}

const GRADE_BEST = 10
const GRADE_MID = 5.5
const GRADE_WORST = 1

/**
 * 风险值在三个色带点上分段线性地映到 10、5.5、1，两端截断。
 * 出自 unclebob/uml-viewer@0171682 src/uml_viewer/domain/config.clj 的 `along` 与 `crap-grade`。
 */
export function gradeOf(risk: number, bands: Bands): number {
  const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
    x0 === x1 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  if (risk <= bands.green) return GRADE_BEST
  if (risk <= bands.yellow) return lerp(risk, bands.green, bands.yellow, GRADE_BEST, GRADE_MID)
  if (risk <= bands.red) return lerp(risk, bands.yellow, bands.red, GRADE_MID, GRADE_WORST)
  return GRADE_WORST
}

/** 同一文件的 `crap-band`：不超过 green 为绿，不超过 yellow 为黄，其余为红。 */
export function bandOf(risk: number, bands: Bands): Band {
  if (risk <= bands.green) return 'green'
  return risk <= bands.yellow ? 'yellow' : 'red'
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * 均值、**总体**标准差（除以 n）与最大值，各自四舍五入到 0.1；风险值取四舍五入后的均值加标准差。
 * 出自 uml-viewer@0171682 application/overlay.clj:103-113。
 */
export function spread(scores: readonly number[]): {
  mu: number
  sigma: number
  max: number
  risk: number
} {
  if (scores.length === 0) return { mu: 0, sigma: 0, max: 0, risk: 0 }
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length
  const mu = round1(mean)
  const sigma = round1(Math.sqrt(variance))
  return { mu, sigma, max: round1(Math.max(...scores)), risk: mu + sigma }
}

/**
 * 行内排序：位置取下标 × 80；做 5 轮，每轮从上到下逐行，按「无向邻居当前位置的平均值」稳定排序
 * （没有邻居就用自身位置），再重排为下标 × 80。只有重心法，不统计交叉数。
 * 出自 uml-viewer@0171682 engine/layout.clj:286-358。
 * 这里每行是若干段，只在段内重排：组级调用每行一段，成员级调用每个组一段（成员不出自己的组）。
 */
export function barycenterOrder(
  rows: readonly (readonly (readonly string[])[])[],
  neighbors: ReadonlyMap<string, ReadonlySet<string>>,
): string[][][] {
  const SPACING = 80
  const ordered = rows.map(row => row.map(segment => [...segment]))
  const position = new Map<string, number>()
  const place = (row: readonly (readonly string[])[]) => {
    let index = 0
    for (const segment of row)
      for (const node of segment) {
        position.set(node, index * SPACING)
        index += 1
      }
  }
  for (const row of ordered) place(row)
  for (let round = 0; round < 5; round += 1) {
    for (const row of ordered) {
      for (const segment of row) {
        const keyed = segment.map((node, index) => {
          const around = [...(neighbors.get(node) ?? [])]
            .map(other => position.get(other))
            .filter((value): value is number => value !== undefined)
          const own = position.get(node) ?? 0
          const key =
            around.length === 0 ? own : around.reduce((sum, v) => sum + v, 0) / around.length
          return { node, index, key }
        })
        keyed.sort((a, b) => a.key - b.key || a.index - b.index)
        segment.splice(0, segment.length, ...keyed.map(item => item.node))
      }
      place(row)
    }
  }
  return ordered
}

function undirected(
  edges: readonly { readonly from: string; readonly to: string }[],
): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>()
  const add = (a: string, b: string) => {
    const set = neighbors.get(a) ?? new Set<string>()
    set.add(b)
    neighbors.set(a, set)
  }
  for (const edge of edges) {
    if (edge.from === edge.to) continue
    add(edge.from, edge.to)
    add(edge.to, edge.from)
  }
  return neighbors
}

function isMeasuredSource(path: string): boolean {
  return /\/src\//u.test(path) && !isTestPath(path) && !path.endsWith('.d.ts')
}

/**
 * 函数行范围内、且不落在更内层有名函数里的语句行的命中比例；范围内没有语句行时不给数。
 * crapper@4909ad2 coverage.py 按整个区间求比例、区间内没有行时记 0%；这里内层有名函数各自成单元，
 * 所以把它们的行从外层扣掉，外层只剩声明时不拿 0% 去罚它。
 */
function coverageOf(
  hits: LineHits,
  unit: { readonly line: number; readonly endLine: number },
  nested: readonly { readonly line: number; readonly endLine: number }[],
): number | undefined {
  let total = 0
  let covered = 0
  for (const [line, hit] of hits) {
    if (line < unit.line || line > unit.endLine) continue
    if (nested.some(inner => line >= inner.line && line <= inner.endLine)) continue
    total += 1
    if (hit) covered += 1
  }
  return total === 0 ? undefined : covered / total
}

export interface BuildInput {
  readonly files: readonly SourceFile[]
  readonly policy: GroupDirectionPolicy
  readonly thresholds: Thresholds
  readonly bands: Bands
  /** 基线以来改动的文件与行区间；缺席表示没有基线。 */
  readonly changed?: ChangedLines
  /**
   * 改动文件在基线上的文本（基线上没有这个文件则值为 undefined）。给了它，函数是否变更按函数文本
   * 摘要比对；没给的文件退回「改动行是否落在函数范围内」。
   */
  readonly baseTexts?: ReadonlyMap<string, string | undefined>
  readonly coverage?: CoverageInput
  readonly commits?: CommitShape
}

function layoutOf(
  graph: MemberGraph,
  policy: GroupDirectionPolicy,
  memberRows: ReadonlyMap<string, MemberRow>,
  bands: Bands,
): GroupRow[][] {
  const groupOf = new Map(graph.members.map(member => [member.path, member.group]))
  const present = new Set(groupOf.values())
  // 行从最外层排到最内层，与画面自上而下一致。
  const layerRows = [...policy.layers]
    .map((layer, index) => ({ index, groups: layer.groups.filter(group => present.has(group)) }))
    .reverse()

  const groupEdges = graph.edges
    .map(edge => ({ from: groupOf.get(edge.from) ?? '', to: groupOf.get(edge.to) ?? '' }))
    .filter(edge => edge.from !== '' && edge.to !== '')
  const groupOrder = barycenterOrder(
    layerRows.map(row => [row.groups]),
    undirected(groupEdges),
  ).map(row => row[0] ?? [])

  const membersOf = (group: string) =>
    graph.members.filter(member => member.group === group).map(member => member.path)
  const memberOrder = barycenterOrder(
    groupOrder.map(groups => groups.map(membersOf)),
    undirected(graph.edges),
  )

  const layout: GroupRow[][] = policy.layers.map(() => [])
  layerRows.forEach((row, rowIndex) => {
    layout[row.index] = (groupOrder[rowIndex] ?? []).map((group, groupIndex) => {
      const members = memberOrder[rowIndex]?.[groupIndex] ?? []
      // 父节点取最差的子节点：uml-viewer@0171682 application/hierarchy.clj:94-104。
      const risk = members.reduce(
        (worst, path) => Math.max(worst, memberRows.get(path)?.risk ?? 0),
        0,
      )
      return { group, risk, grade: gradeOf(risk, bands), members }
    })
  })
  return layout
}

/** 路径一律相对于仓库根。 */
export function buildReport(input: BuildInput): Report {
  const { files, policy, thresholds, bands, changed, coverage } = input
  const graph = memberGraph(files)
  const findings = evaluateDirection(graph, policy)
  const layerOf = new Map<string, number>()
  policy.layers.forEach((layer, index) => {
    for (const group of layer.groups) layerOf.set(group, index)
  })

  // 跑了测试却一条语句都没命中：几乎总是测试在子进程或别处执行，不是真的零覆盖，按缺数据处理。
  const lineTotals = new Map<string, { total: number; covered: number }>()
  for (const [path, hits] of coverage?.files ?? []) {
    const member = memberOf(path)
    if (member === undefined) continue
    const totals = lineTotals.get(member.path) ?? { total: 0, covered: 0 }
    for (const hit of hits.values()) {
      totals.total += 1
      if (hit) totals.covered += 1
    }
    lineTotals.set(member.path, totals)
  }
  const hasData = (member: string) => (lineTotals.get(member)?.covered ?? 0) > 0

  const functions: FunctionRow[] = []
  for (const file of files) {
    const member = memberOf(file.path)
    if (member === undefined || !isMeasuredSource(file.path)) continue
    const units = functionMetrics(file)
    const ranges = changed?.get(file.path)
    const hits = hasData(member.path) ? coverage?.files.get(file.path) : undefined

    // 函数是否变更：比对函数自身文本的摘要（unclebob/mutator@21d6d6f engine.py:61-98 的判法），
    // 不看 diff 行号——挪位置、上方插入代码都不算变。
    let isChanged = (unit: { name: string; line: number; endLine: number }): boolean =>
      ranges !== undefined && touches(ranges, unit.line, unit.endLine)
    if (ranges !== undefined && input.baseTexts?.has(file.path) === true) {
      const baseText = input.baseTexts.get(file.path)
      if (baseText === undefined) isChanged = () => true
      else {
        const before = unitDigests({ path: file.path, text: baseText })
        const after = unitDigests(file)
        isChanged = unit => before.get(unit.name) !== after.get(unit.name)
      }
    }

    for (const unit of units) {
      const ratio =
        hits === undefined ? undefined : coverageOf(hits, unit, nestedUnits(unit, units))
      const score = ratio === undefined ? unit.complexity : crap(unit.complexity, ratio)
      functions.push({
        path: file.path,
        member: member.path,
        name: unit.name,
        line: unit.line,
        endLine: unit.endLine,
        complexity: unit.complexity,
        ...(ratio === undefined ? {} : { coverage: ratio, crap: score }),
        score,
        level: levelOf(score, thresholds),
        grade: gradeOf(score, bands),
        changed: isChanged(unit),
      })
    }
  }

  const changedMembers = new Set<string>()
  for (const path of changed?.keys() ?? []) {
    const member = memberOf(path)
    if (member !== undefined) changedMembers.add(member.path)
  }

  // 扇入、扇出按去重后的相邻成员数；不稳定度 = 出 /（入 + 出），两者都为 0 时取 0。
  // 出自 unclebob/dependency-checker@61097ea core/stats.clj。抽象度与主序列距离没有移植：
  // 那套判法会把稳定而没有抽象的叶子一律判进「痛苦区」，对纯数据契约包不成立。
  const fanIn = new Map<string, number>()
  const fanOut = new Map<string, number>()
  for (const edge of graph.edges) {
    fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1)
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1)
  }

  const members: MemberRow[] = graph.members.map(member => {
    const own = functions.filter(row => row.member === member.path)
    const stats = spread(own.map(row => row.score))
    let status: MemberRow['coverage'] = 'not-run'
    let lineCoverage: number | undefined
    if (coverage?.members.has(member.path) === true) {
      const totals = lineTotals.get(member.path)
      status = hasData(member.path) ? 'measured' : 'no-data'
      if (totals !== undefined && totals.covered > 0) lineCoverage = totals.covered / totals.total
    }
    const incoming = fanIn.get(member.path) ?? 0
    const outgoing = fanOut.get(member.path) ?? 0
    return {
      path: member.path,
      group: member.group,
      layer: layerOf.get(member.group) ?? -1,
      functions: own.length,
      ...stats,
      grade: gradeOf(stats.risk, bands),
      band: bandOf(stats.risk, bands),
      overWarn: own.filter(row => row.level === 'warn').length,
      overAlert: own.filter(row => row.level === 'alert').length,
      changed: changedMembers.has(member.path),
      changedOver: own.filter(row => row.changed && row.level !== 'ok').length,
      coverage: status,
      ...(lineCoverage === undefined ? {} : { lineCoverage }),
      fanIn: incoming,
      fanOut: outgoing,
      instability: incoming + outgoing === 0 ? 0 : outgoing / (incoming + outgoing),
    }
  })

  const violating = new Set(
    findings.flatMap(finding => finding.edges.map(edge => `${edge.from}\u0000${edge.to}`)),
  )
  const excepted = new Set(policy.exceptions.map(entry => `${entry.from}\u0000${entry.to}`))
  const edges: EdgeRow[] = graph.edges.map(edge => {
    const key = `${edge.from}\u0000${edge.to}`
    return {
      from: edge.from,
      to: edge.to,
      count: edge.sites.length,
      sites: edge.sites.slice(0, 5),
      violating: violating.has(key),
      excepted: excepted.has(key),
      changed: edge.sites.some(site => {
        const ranges = changed?.get(site.path)
        return ranges !== undefined && touches(ranges, site.line, site.line)
      }),
    }
  })

  return {
    thresholds,
    bands,
    coverageEnabled: coverage !== undefined,
    hasBase: changed !== undefined,
    layout: layoutOf(graph, policy, new Map(members.map(row => [row.path, row])), bands),
    members,
    functions,
    edges,
    findings,
    exceptions: policy.exceptions,
    ...(input.commits === undefined ? {} : { commits: input.commits }),
    failedTests: [...(coverage?.members ?? [])].filter(([, code]) => code !== 0).map(([m]) => m),
    staleDist: coverage?.staleDist ?? [],
  }
}

export interface SummaryContext {
  readonly shortHead: string
  readonly branch: string
  readonly dirty: boolean
  readonly baseRef?: string
  readonly reviewPath: string
  readonly top: number
}

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`
const fixed = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

export function describeFunction(row: FunctionRow): string {
  const coverage = row.coverage === undefined ? '' : ` 覆盖 ${percent(row.coverage)}`
  const score = row.crap === undefined ? '' : ` CRAP ${fixed(row.crap)}`
  return `${row.path}:${row.line} ${row.name} CC ${row.complexity}${coverage}${score}`
}

/** 交付说明里原样粘贴的摘要；不超过 12 行。 */
export function summaryLines(report: Report, context: SummaryContext): string[] {
  // 开了覆盖率也只有跑过的成员有 CRAP，其余函数仍按圈复杂度评级。
  const metric = report.coverageEnabled ? 'CRAP 或圈复杂度' : '圈复杂度'
  const lines: string[] = []
  const base = context.baseRef === undefined ? '无基线，按全仓报告' : `基线 ${context.baseRef}`
  lines.push(
    `结构度量 ${context.shortHead}${context.dirty ? '（工作树不干净）' : ''} · 分支 ${context.branch} · ${base}`,
  )

  const scope = report.hasBase ? report.functions.filter(row => row.changed) : report.functions
  if (report.hasBase) {
    const changedMembers = report.members.filter(member => member.changed)
    const shape =
      report.commits === undefined
        ? ''
        : `；提交 ${report.commits.commits} 个，每提交文件数中位 ${report.commits.medianFiles}、最大 ${report.commits.maxFiles}`
    lines.push(`范围：变更 ${changedMembers.length} 个成员、${scope.length} 个函数${shape}`)
  } else {
    lines.push(`范围：${report.members.length} 个成员、${report.functions.length} 个函数`)
  }

  const cycleCount = report.findings.filter(finding => finding.kind.endsWith('cycle')).length
  const directionCount = report.findings.length - cycleCount
  const newEdges = report.edges.filter(edge => edge.changed)
  const red = report.members.filter(member => member.band === 'red').length
  const yellow = report.members.filter(member => member.band === 'yellow').length
  lines.push(
    `结构：方向违规 ${directionCount}，环 ${cycleCount}，已登记例外 ${report.exceptions.length}` +
      (report.hasBase ? `，变更触及的跨成员导入 ${newEdges.length} 条` : '') +
      `；成员风险 红 ${red}、黄 ${yellow}、绿 ${report.members.length - red - yellow}`,
  )

  const count = (rows: readonly FunctionRow[], level: Level) =>
    rows.filter(row => row.level === level).length
  const { warn, alert } = report.thresholds
  if (report.hasBase) {
    const rest = report.functions.filter(row => !row.changed)
    lines.push(
      `${metric}（warn ${warn}／alert ${alert}）：变更函数超 alert ${count(scope, 'alert')}、超 warn ${count(scope, 'warn')}；存量超 alert ${count(rest, 'alert')}、超 warn ${count(rest, 'warn')}`,
    )
  } else {
    lines.push(
      `${metric}（warn ${warn}／alert ${alert}）：超 alert ${count(scope, 'alert')}、超 warn ${count(scope, 'warn')}`,
    )
  }

  if (report.coverageEnabled) {
    const ran = report.members.filter(member => member.coverage !== 'not-run')
    const noData = ran.filter(member => member.coverage === 'no-data')
    const measured = ran
      .filter(member => member.lineCoverage !== undefined)
      .map(
        member =>
          `${member.path.split('/').pop() ?? member.path} ${percent(member.lineCoverage ?? 0)}`,
      )
    lines.push(
      `覆盖率：${measured.length === 0 ? '无成员有数据' : measured.slice(0, 6).join('、')}` +
        (measured.length > 6 ? ` 等 ${measured.length} 个` : '') +
        (noData.length === 0 ? '' : `；缺数据 ${noData.length} 个`) +
        (report.failedTests.length === 0 ? '' : `；测试未通过 ${report.failedTests.length} 个`) +
        (report.staleDist.length === 0
          ? ''
          : `；dist 早于源码 ${report.staleDist.length} 个（先构建）`),
    )
  } else {
    lines.push('覆盖率：未开启，只报圈复杂度')
  }

  const over = scope
    .filter(row => row.level !== 'ok')
    .sort((a, b) => b.score - a.score)
    .slice(0, context.top)
  if (over.length > 0) {
    lines.push(`${report.hasBase ? '变更函数' : '全仓'}里超阈值的前 ${over.length} 个：`)
    for (const row of over) lines.push(`  ${describeFunction(row)}`)
  }
  lines.push(`审讯页：${context.reviewPath}`)
  return lines
}
