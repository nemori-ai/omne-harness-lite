/// <reference lib="dom" />
import type { SelectedArchitecture, RelationKind, ViewNode, ViewEdge } from './view.ts'

/** A second presentation of the selected overview. Rows are sources, columns are targets. */
export function architectureMatrix(
  selected: SelectedArchitecture,
  relations: Readonly<Record<RelationKind, string>>,
  onNode: (node: ViewNode) => void,
  onEdge: (edge: ViewEdge) => void,
): SVGSVGElement {
  const cell = 56,
    left = 210,
    top = 165
  const width = left + selected.nodes.length * cell + 30
  const height = top + selected.nodes.length * cell + 76
  const el = (tag: string, attrs: Record<string, string>, text?: string): SVGElement => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
    if (text !== undefined) node.textContent = text
    return node
  }
  const svg = el('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${width} ${height}`,
    width: String(width),
    height: String(height),
    role: 'img',
    'aria-label': '系统总览矩阵',
  })
  if (!(svg instanceof SVGSVGElement)) throw new Error('Expected matrix SVG')
  svg.append(
    el(
      'text',
      { x: '16', y: '24', fill: '#1d1f21', 'font-size': '15' },
      '系统总览 · 直接源码关系矩阵',
    ),
    el(
      'text',
      { x: '16', y: '46', fill: '#475569', 'font-size': '11' },
      '行发起 → 列目标 · 数字为输入事实身份数，非调用量',
    ),
  )
  const indices = new Map(selected.nodes.map((node, index) => [node.id, index]))
  function appendRow(row: number, node: ViewNode): void {
    const y = top + row * cell
    const g = el('g', {
      'data-node-id': node.id,
      'data-row-id': node.id,
      role: 'button',
      tabindex: '0',
      'aria-label': node.label,
    })
    const color =
      selected.selection.complexity && node.complexity?.functions
        ? { green: '#dcefdc', yellow: '#fbeebf', red: '#f8d2cf' }[node.complexity.band]
        : '#f3f5f2'
    g.append(
      el('rect', {
        x: '10',
        y: String(y + 2),
        width: String(left - 16),
        height: String(cell - 4),
        fill: color,
        stroke:
          node.change === 'added' ? '#1f6feb' : node.change === 'removed' ? '#b7473d' : '#d5dcd3',
        'stroke-dasharray': node.change === 'removed' ? '4 3' : '',
        rx: '4',
      }),
      el('text', { x: '18', y: String(y + 22), fill: '#1d1f21', 'font-size': '12' }, node.label),
      el(
        'text',
        { x: '18', y: String(y + 40), fill: '#64748b', 'font-size': '10' },
        `目录聚合 · ${node.count ?? 0} 成员${selected.selection.complexity ? ` · CC ${node.complexity?.functions ? node.complexity.max : '无函数'}` : ''}${selected.selection.coupling ? ` · 入${node.fanIn ?? 0}/出${node.fanOut ?? 0}` : ''}`,
      ),
    )
    g.addEventListener('click', () => onNode(node))
    g.addEventListener('keydown', event => {
      if (event instanceof KeyboardEvent && ['Enter', ' '].includes(event.key)) {
        event.preventDefault()
        onNode(node)
      }
    })
    svg.append(g)
    svg.append(
      el(
        'text',
        {
          'data-column-id': node.id,
          transform: `translate(${left + row * cell + 30},${top - 10}) rotate(-55)`,
          fill: '#475569',
          'font-size': '11',
        },
        node.label,
      ),
    )
    for (let column = 0; column < selected.nodes.length; column++)
      svg.append(
        el('rect', {
          x: String(left + column * cell),
          y: String(y),
          width: String(cell),
          height: String(cell),
          fill: row === column ? '#e5e9e2' : '#fff',
          stroke: '#e5e9e2',
        }),
      )
  }
  for (const [row, node] of selected.nodes.entries()) appendRow(row, node)
  const pairs = new Map<string, ViewEdge[]>()
  for (const edge of selected.edges) {
    const key = JSON.stringify([edge.from, edge.to])
    const list = pairs.get(key) ?? []
    list.push(edge)
    pairs.set(key, list)
  }
  for (const list of pairs.values()) {
    const first = list[0]
    if (first === undefined) continue
    const row = indices.get(first.from),
      column = indices.get(first.to)
    if (row === undefined || column === undefined) throw new Error('Missing matrix endpoint')
    const height = (cell - 4) / list.length
    for (const [index, edge] of list.entries()) {
      const x = left + column * cell + 2,
        y = top + row * cell + 2 + index * height
      appendCell(edge, x, y, height)
    }
  }
  function appendCell(edge: ViewEdge, x: number, y: number, height: number): void {
    const color =
      edge.kind === 'composition' ? '#377d70' : edge.kind === 'type-import' ? '#7c6eaa' : '#475569'
    const path = el('path', {
      'data-edge-id': edge.id,
      role: 'button',
      tabindex: '0',
      'data-from': edge.from,
      'data-to': edge.to,
      'data-count': String(edge.evidence.length),
      'data-relation-kind': edge.kind,
      'data-change': edge.change,
      'aria-label': `${nodeLabel(edge.from)} → ${nodeLabel(edge.to)} · ${relations[edge.kind]} · ${edge.change} · ${edge.evidence.length} 个输入身份`,
      d: `M${x},${y} h${cell - 4} v${height - 1} h-${cell - 4} z`,
      fill: color,
      stroke: edge.change === 'added' ? '#1f6feb' : edge.change === 'removed' ? '#b7473d' : color,
      'stroke-width': edge.change === 'present' ? '1' : '3',
      'stroke-dasharray': edge.change === 'removed' ? '3 2' : '',
    })
    path.append(
      el(
        'title',
        {},
        `${relations[edge.kind]} · ${nodeLabel(edge.from)} → ${nodeLabel(edge.to)} · ${edge.evidence.length} 条事实 · ${edge.change}`,
      ),
    )
    path.addEventListener('click', () => onEdge(edge))
    path.addEventListener('keydown', event => {
      if (event instanceof KeyboardEvent && ['Enter', ' '].includes(event.key)) {
        event.preventDefault()
        onEdge(edge)
      }
    })
    svg.append(
      path,
      el(
        'text',
        {
          x: String(x + 5),
          y: String(y + height / 2 + 3),
          fill: '#fff',
          'font-size': String(Math.min(11, height - 2)),
          'pointer-events': 'none',
        },
        `${edge.kind === 'composition' ? '装' : edge.kind === 'type-import' ? '型' : '运'} ${edge.evidence.length}`,
      ),
    )
  }
  function nodeLabel(id: string): string {
    return selected.nodes.find(node => node.id === id)?.label ?? id
  }
  svg.append(
    el(
      'text',
      { x: '16', y: String(height - 42), fill: '#475569', 'font-size': '11' },
      '运＝运行导入 · 型＝类型导入 · 装＝装配声明 · 对角线组内关系请展开',
    ),
    el(
      'text',
      { x: '16', y: String(height - 22), fill: '#475569', 'font-size': '11' },
      '蓝框＝新增 · 红虚框＝BASE 删除 · 目录不表示运行边界 · 不推断服务绑定',
    ),
  )
  return svg
}
