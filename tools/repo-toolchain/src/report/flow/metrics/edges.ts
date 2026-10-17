// 结构图画哪些线。选中一个成员时只画它自己的线（指向它的用虚线），别处只留违规；
// 未选中时违规与已登记例外始终画出，本次变更触及的边不超过上限才逐条画，超过只留卡片上的入/出标记。
// 这是 uml-viewer 走过的弯路换来的取舍：大变更下逐条画只会糊成一团（unclebob/uml-viewer@0171682
// application/hit.clj:28-77；arch-view 89907df8 删掉了整套箭头走线）。
import type { EdgeRow, Report } from '../../../metrics/report.ts'

export type EdgeTone = 'bad' | 'changed' | 'plain' | 'group'

export interface VisibleEdge {
  readonly id: string
  /** 成员路径，或组线时为组容器的 id（`group:<组>`）。 */
  readonly from: string
  readonly to: string
  readonly tone: EdgeTone
  readonly dashed: boolean
  readonly width: number
}

export interface EdgeState {
  readonly selected: string | null
  readonly groupLines: boolean
  readonly limit: number
}

export interface EdgeSelection {
  readonly edges: readonly VisibleEdge[]
  /** 变更边超过上限、没有逐条画时给出的说明；否则为空串。 */
  readonly note: string
}

/** 违规最重，其次本次变更触及的。 */
export function worstOf(edges: readonly EdgeRow[]): 'bad' | 'changed' | '' {
  if (edges.some(edge => edge.violating)) return 'bad'
  return edges.some(edge => edge.changed) ? 'changed' : ''
}

function toneOf(edge: EdgeRow): EdgeTone {
  if (edge.violating) return 'bad'
  return edge.changed ? 'changed' : 'plain'
}

function widthOf(edge: EdgeRow): number {
  return edge.violating ? 2.4 : 1.4
}

function memberEdge(edge: EdgeRow, dashed: boolean): VisibleEdge {
  return {
    id: `${edge.from}>${edge.to}`,
    from: edge.from,
    to: edge.to,
    tone: toneOf(edge),
    dashed,
    width: widthOf(edge),
  }
}

/** 组间连线：去重，不画组内的，也不画指向最内层的——人人都依赖最内层，这些线只添乱。 */
function groupEdges(report: Report): VisibleEdge[] {
  const groupOf = new Map(report.members.map(member => [member.path, member.group]))
  const placed = new Set(report.layout.flatMap(groups => groups.map(group => group.group)))
  const innermost = new Set((report.layout[0] ?? []).map(group => group.group))
  const seen = new Set<string>()
  const lines: VisibleEdge[] = []
  for (const edge of report.edges) {
    const from = groupOf.get(edge.from)
    const to = groupOf.get(edge.to)
    if (from === undefined || to === undefined || from === to || innermost.has(to)) continue
    if (!placed.has(from) || !placed.has(to)) continue
    const key = `${from}>${to}`
    if (seen.has(key)) continue
    seen.add(key)
    lines.push({
      id: `group:${key}`,
      from: `group:${from}`,
      to: `group:${to}`,
      tone: 'group',
      dashed: false,
      width: 1,
    })
  }
  return lines
}

export function visibleEdges(report: Report, state: EdgeState): EdgeSelection {
  const members = new Set(report.members.map(member => member.path))
  const drawable = report.edges.filter(edge => members.has(edge.from) && members.has(edge.to))
  if (state.selected !== null) {
    const selected = state.selected
    const edges = drawable.flatMap(edge => {
      if (edge.from === selected || edge.to === selected)
        return [memberEdge(edge, edge.to === selected)]
      return edge.violating ? [memberEdge(edge, false)] : []
    })
    return { edges, note: '' }
  }
  const touched = drawable.filter(edge => edge.changed && !edge.violating)
  const drawTouched = touched.length <= state.limit
  const edges = [
    ...(state.groupLines ? groupEdges(report) : []),
    ...drawable.flatMap(edge => {
      if (edge.violating) return [memberEdge(edge, false)]
      return edge.changed && drawTouched ? [memberEdge(edge, false)] : []
    }),
  ]
  const note =
    touched.length === 0 || drawTouched
      ? ''
      : `本次变更触及 ${touched.length} 条跨成员导入，超过 ${state.limit} 条不逐条画：看卡片上的蓝色入/出标记，或点成员只看它的线。`
  return { edges, note }
}
