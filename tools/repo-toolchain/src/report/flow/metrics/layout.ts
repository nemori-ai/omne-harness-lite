// 结构图的几何：层是横向的列（第 0 层最左），组是层内的容器，成员是组内网格里的卡片。
// 分组与组内顺序是 report.layout 给的事实（行内排序已按重心法排好），这里只摆位置，不改归属。
import type { Report } from '../../../metrics/report.ts'

export const CARD_WIDTH = 188
export const CARD_HEIGHT = 58
const CARD_GAP_X = 48
const CARD_GAP_Y = 18
const GROUP_PAD_X = 22
const GROUP_HEADER = 46
const GROUP_PAD_BOTTOM = 22
const GROUP_GAP = 18
const LAYER_PAD_X = 18
const LAYER_HEADER = 40
const LAYER_PAD_BOTTOM = 18
const LAYER_GAP = 56
const MAX_COLUMNS = 4

export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface LayerBox extends Box {
  readonly id: string
  /** 层号；未登记层位的组收在 layer 为 undefined 的兜底列里。 */
  readonly layer: number | undefined
  readonly label: string
}

export interface GroupBox extends Box {
  readonly id: string
  readonly group: string
  readonly layer: number | undefined
}

export interface MemberBox extends Box {
  readonly id: string
  readonly path: string
  readonly group: string
}

export interface StructureLayout {
  readonly layers: readonly LayerBox[]
  readonly groups: readonly GroupBox[]
  readonly members: readonly MemberBox[]
}

/** 组内网格的列数：成员多就多列，封顶 MAX_COLUMNS，让大组变高而不是变得过宽。 */
export function columnsFor(count: number): number {
  return Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(Math.sqrt(count / 2))))
}

interface GroupInput {
  readonly group: string
  readonly members: readonly string[]
}

function groupSize(count: number): { width: number; height: number } {
  const columns = columnsFor(count)
  const rows = Math.max(1, Math.ceil(count / columns))
  return {
    width: GROUP_PAD_X * 2 + columns * CARD_WIDTH + (columns - 1) * CARD_GAP_X,
    height: GROUP_HEADER + rows * CARD_HEIGHT + (rows - 1) * CARD_GAP_Y + GROUP_PAD_BOTTOM,
  }
}

/**
 * 层内的组自上而下排；超过目标高度就另起一个子列。目标高度取全图最高的单个组，
 * 所以最大的组独占一列，其余层压成相近的高度，整张图接近横向的矩形。
 */
function packColumns(groups: readonly GroupInput[], target: number): GroupInput[][] {
  const columns: GroupInput[][] = []
  let current: GroupInput[] = []
  let height = 0
  for (const group of groups) {
    const size = groupSize(group.members.length).height
    if (current.length > 0 && height + GROUP_GAP + size > target) {
      columns.push(current)
      current = []
      height = 0
    }
    height += (current.length === 0 ? 0 : GROUP_GAP) + size
    current.push(group)
  }
  if (current.length > 0) columns.push(current)
  return columns
}

export function structureLayout(report: Report): StructureLayout {
  const placed = new Set(report.layout.flatMap(groups => groups.flatMap(group => group.members)))
  const unplaced = report.members.filter(member => !placed.has(member.path))
  const unplacedGroups = [...new Set(unplaced.map(member => member.group))].map(group => ({
    group,
    members: unplaced.filter(member => member.group === group).map(member => member.path),
  }))
  const columns: { layer: number | undefined; label: string; groups: readonly GroupInput[] }[] =
    report.layout.flatMap((groups, index) =>
      groups.length === 0
        ? []
        : [
            {
              layer: index,
              label: index === 0 ? '第 0 层 · 不依赖别的组' : `第 ${index} 层`,
              groups,
            },
          ],
    )
  if (unplacedGroups.length > 0)
    columns.push({ layer: undefined, label: '未分层的组', groups: unplacedGroups })
  const target = Math.max(
    0,
    ...columns.flatMap(column =>
      column.groups.map(group => groupSize(group.members.length).height),
    ),
  )
  const layers: LayerBox[] = []
  const groupBoxes: GroupBox[] = []
  const members: MemberBox[] = []
  let x = 0
  for (const column of columns) {
    let innerX = x + LAYER_PAD_X
    let bottom = LAYER_HEADER
    for (const stack of packColumns(column.groups, target)) {
      let y = LAYER_HEADER
      let width = 0
      for (const group of stack) {
        const size = groupSize(group.members.length)
        groupBoxes.push({
          id: `group:${group.group}`,
          group: group.group,
          layer: column.layer,
          x: innerX,
          y,
          ...size,
        })
        const perRow = columnsFor(group.members.length)
        group.members.forEach((path, index) => {
          members.push({
            id: path,
            path,
            group: group.group,
            x: innerX + GROUP_PAD_X + (index % perRow) * (CARD_WIDTH + CARD_GAP_X),
            y: y + GROUP_HEADER + Math.floor(index / perRow) * (CARD_HEIGHT + CARD_GAP_Y),
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
          })
        })
        y += size.height + GROUP_GAP
        width = Math.max(width, size.width)
      }
      bottom = Math.max(bottom, y - GROUP_GAP)
      innerX += width + GROUP_GAP
    }
    const width = innerX - GROUP_GAP + LAYER_PAD_X - x
    layers.push({
      id: `layer:${column.layer ?? 'unplaced'}`,
      layer: column.layer,
      label: column.label,
      x,
      y: 0,
      width,
      height: bottom + LAYER_PAD_BOTTOM,
    })
    x += width + LAYER_GAP
  }
  return { layers, groups: groupBoxes, members }
}
