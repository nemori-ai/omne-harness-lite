import { isTestPath, type SourceFile } from '../core/rule.ts'
import { functionMetrics, nestedUnits, unitDigests } from './complexity.ts'
import { touches, type ChangedLines, type CommitShape } from '../core/git.ts'
import {
  cycles,
  memberOf,
  type DependencyFinding,
  type DependencyGraph,
  type ImportSite,
  type Member,
  type MemberEdge,
} from '../deps/graph.ts'

export interface Thresholds {
  readonly warn: number
  readonly alert: number
}

export interface Bands {
  readonly green: number
  readonly yellow: number
  readonly red: number
}

export type Level = 'ok' | 'warn' | 'alert'
export type Band = 'green' | 'yellow' | 'red'

export type LineHits = ReadonlyMap<number, boolean>

export interface CoverageInput {
  readonly files: ReadonlyMap<string, LineHits>
  readonly members: ReadonlyMap<string, number>
  readonly staleDist: readonly string[]
}

export interface FunctionRow {
  readonly path: string
  readonly member: string
  readonly name: string
  readonly line: number
  readonly endLine: number
  readonly complexity: number
  readonly coverage?: number
  readonly crap?: number
  readonly score: number
  readonly level: Level
  readonly grade: number
  readonly changed: boolean
}

export interface MemberRow {
  readonly path: string
  readonly group: string
  readonly layer: number
  readonly functions: number
  readonly mu: number
  readonly sigma: number
  readonly max: number
  readonly risk: number
  readonly grade: number
  readonly band: Band
  readonly overWarn: number
  readonly overAlert: number
  readonly changed: boolean
  readonly changedOver: number
  readonly coverage: 'measured' | 'no-data' | 'not-run'
  readonly lineCoverage?: number
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
  readonly changed: boolean
}

export interface GroupRow {
  readonly group: string
  readonly risk: number
  readonly grade: number
  readonly members: readonly string[]
}

export interface Report {
  readonly thresholds: Thresholds
  readonly bands: Bands
  readonly coverageEnabled: boolean
  readonly hasBase: boolean
  readonly layout: readonly (readonly GroupRow[])[]
  readonly members: readonly MemberRow[]
  readonly functions: readonly FunctionRow[]
  readonly edges: readonly EdgeRow[]
  readonly findings: readonly DependencyFinding[]
  readonly commits?: CommitShape
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

export function gradeOf(risk: number, bands: Bands): number {
  const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
    x0 === x1 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  if (risk <= bands.green) return GRADE_BEST
  if (risk <= bands.yellow) return lerp(risk, bands.green, bands.yellow, GRADE_BEST, GRADE_MID)
  if (risk <= bands.red) return lerp(risk, bands.yellow, bands.red, GRADE_MID, GRADE_WORST)
  return GRADE_WORST
}

export function bandOf(risk: number, bands: Bands): Band {
  if (risk <= bands.green) return 'green'
  return risk <= bands.yellow ? 'yellow' : 'red'
}

const round1 = (value: number) => Math.round(value * 10) / 10

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

export function isMeasuredSource(path: string): boolean {
  return /\/src\//u.test(path) && !isTestPath(path) && !path.endsWith('.d.ts')
}

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
  readonly graph: DependencyGraph
  readonly thresholds: Thresholds
  readonly bands: Bands
  readonly changed?: ChangedLines
  readonly baseTexts?: ReadonlyMap<string, string | undefined>
  readonly coverage?: CoverageInput
  readonly commits?: CommitShape
}

interface LayoutGraph {
  readonly members: readonly Member[]
  readonly edges: readonly MemberEdge[]
}

export function groupLayers(graph: LayoutGraph): ReadonlyMap<string, number> {
  const groupOf = new Map(graph.members.map(member => [member.path, member.group]))
  const groups = [...new Set(groupOf.values())].sort()
  const targets = new Map<string, Set<string>>(groups.map(group => [group, new Set<string>()]))
  for (const edge of graph.edges) {
    const from = groupOf.get(edge.from)
    const to = groupOf.get(edge.to)
    if (from !== undefined && to !== undefined && from !== to) targets.get(from)?.add(to)
  }
  const component = new Map<string, string>(groups.map(group => [group, group]))
  for (const cycle of cycles(
    groups,
    [...targets].flatMap(([from, tos]) => [...tos].map(to => ({ from, to }))),
  ))
    for (const group of cycle) component.set(group, cycle[0] ?? group)
  const layer = new Map<string, number>()
  const visiting = new Set<string>()
  const layerOf = (node: string): number => {
    const known = layer.get(node)
    if (known !== undefined) return known
    visiting.add(node)
    let depth = 0
    for (const group of groups) {
      if (component.get(group) !== node) continue
      for (const target of targets.get(group) ?? []) {
        const next = component.get(target) ?? target
        if (next === node || visiting.has(next)) continue
        depth = Math.max(depth, layerOf(next) + 1)
      }
    }
    visiting.delete(node)
    layer.set(node, depth)
    return depth
  }
  return new Map(groups.map(group => [group, layerOf(component.get(group) ?? group)]))
}

function layoutOf(
  graph: LayoutGraph,
  layers: ReadonlyMap<string, number>,
  memberRows: ReadonlyMap<string, MemberRow>,
  bands: Bands,
): GroupRow[][] {
  const groupOf = new Map(graph.members.map(member => [member.path, member.group]))
  const count = Math.max(-1, ...layers.values()) + 1
  const layerRows = Array.from({ length: count }, (_, index) => ({
    index,
    groups: [...layers].filter(([, layer]) => layer === index).map(([group]) => group),
  })).reverse()

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

  const layout: GroupRow[][] = Array.from({ length: count }, () => [])
  layerRows.forEach((row, rowIndex) => {
    layout[row.index] = (groupOrder[rowIndex] ?? []).map((group, groupIndex) => {
      const members = memberOrder[rowIndex]?.[groupIndex] ?? []
      const risk = members.reduce(
        (worst, path) => Math.max(worst, memberRows.get(path)?.risk ?? 0),
        0,
      )
      return { group, risk, grade: gradeOf(risk, bands), members }
    })
  })
  return layout
}

export function buildReport(input: BuildInput): Report {
  const { files, thresholds, bands, changed, coverage } = input
  const known = new Map(input.graph.members.map(member => [member.path, member]))
  for (const file of files) {
    const member = memberOf(file.path)
    if (member !== undefined && !known.has(member.path)) known.set(member.path, member)
  }
  const graph: LayoutGraph = {
    members: [...known.values()].sort((a, b) => a.path.localeCompare(b.path)),
    edges: input.graph.edges,
  }
  const findings = input.graph.findings
  const layerOf = groupLayers(graph)

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
  const edges: EdgeRow[] = graph.edges.map(edge => {
    const key = `${edge.from}\u0000${edge.to}`
    return {
      from: edge.from,
      to: edge.to,
      count: edge.sites.length,
      sites: edge.sites.slice(0, 5),
      violating: violating.has(key),
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
    layout: layoutOf(graph, layerOf, new Map(members.map(row => [row.path, row])), bands),
    members,
    functions,
    edges,
    findings,
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

export function summaryLines(report: Report, context: SummaryContext): string[] {
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
    `结构：依赖违规 ${directionCount}，环 ${cycleCount}` +
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
