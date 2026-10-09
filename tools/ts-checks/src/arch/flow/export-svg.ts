import type { ViewNode } from '../view.ts'
import type { FlowProps } from './api.ts'
import { NODE_HEIGHT, NODE_WIDTH, positionsOf, routesOf } from './geometry.ts'

const CHANGE_LABEL = { present: '', added: '新增', removed: '已删除 · BASE' } as const
const BAND_FILL = { green: '#dcefdc', yellow: '#fbeebf', red: '#f8d2cf' } as const

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function attributes(attrs: Record<string, string | number>): string {
  return Object.entries(attrs)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join('')
}

export function nodeAnnotations(node: ViewNode, props: FlowProps): string[] {
  const violations = props.violations[node.id] ?? 0
  return [
    props.overlays.conformance && violations > 0 ? `偏离 ${violations}` : '',
    node.kind === 'group' ? `${node.count ?? 0} 个当前成员` : '',
    props.overlays.complexity && node.complexity !== undefined
      ? node.complexity.functions === 0
        ? '无函数'
        : `CC 最大 ${node.complexity.max} / 风险 ${node.complexity.risk.toFixed(1)}`
      : '',
    props.overlays.coupling ? `入 ${node.fanIn ?? 0} / 出 ${node.fanOut ?? 0}` : '',
  ].filter(text => text !== '')
}

export function nodeTitle(node: ViewNode): string {
  return node.member?.split('/').pop() ?? node.label
}

export function nodeFill(node: ViewNode, props: FlowProps): string {
  if (props.overlays.complexity && node.complexity !== undefined && node.complexity.functions > 0)
    return BAND_FILL[node.complexity.band]
  return node.kind === 'service' ? '#e6eefb' : node.kind === 'event' ? '#f2e8fb' : '#f5f5f1'
}

export function edgeStroke(change: ViewNode['change']): string {
  return change === 'added' ? '#1f6feb' : change === 'removed' ? '#b7473d' : '#9aa0a6'
}

/**
 * Standalone SVG of the whole current subgraph. It is built from the same ELK geometry as the
 * on-screen graph, so zoom, pan and the viewport never affect what is exported.
 */
export function architectureSvg(props: FlowProps): string {
  const { selected, layout } = props
  const width = Math.max(540, layout.width ?? 0)
  const height = Math.max(160, layout.height ?? 0) + 100
  const positions = positionsOf(layout)
  const routes = routesOf(layout)
  const parts: string[] = []
  parts.push(
    `<text x="24" y="24" fill="#1d1f21" font-size="16">${escape(
      selected.overview
        ? '系统总览 · 跨目录组的直接源码关系'
        : `实际架构 · ${selected.selection.focus || selected.selection.group}`,
    )}</text>`,
    `<text x="24" y="${height - 18}" fill="#475569" font-size="11">蓝＝新增 · 红虚线＝BASE 删除 · 虚线＝类型 / 可选 · 目录不表示运行边界 · 静态同名不表示绑定</text>`,
    '<defs><marker id="arch-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke"/></marker></defs>',
    '<g transform="translate(0,40)">',
  )
  for (const edge of selected.edges) {
    const route = routes.get(edge.id)
    if (route === undefined) throw new Error('Missing edge geometry')
    const dashed =
      edge.kind === 'type-import' || edge.kind === 'optional' || edge.change === 'removed'
    parts.push(
      `<path${attributes({
        'data-edge-id': edge.id,
        d: route.d,
        fill: 'none',
        stroke: edgeStroke(edge.change),
        'stroke-width': 1.5,
        'stroke-opacity': 0.8,
        'stroke-dasharray': dashed ? '5 4' : '',
        'marker-end': 'url(#arch-arrow)',
      })}><title>${escape(`${props.relations[edge.kind]} ${edge.label}`)}</title></path>`,
    )
    for (const label of route.labels)
      parts.push(
        `<text${attributes({
          x: label.x,
          y: label.y + 4,
          'text-anchor': 'middle',
          fill: '#475569',
          'font-size': 12,
          'paint-order': 'stroke',
          stroke: '#fafbf9',
          'stroke-width': 5,
          'stroke-linejoin': 'round',
        })}>${escape(label.text)}</text>`,
      )
  }
  for (const node of selected.nodes) {
    const at = positions.get(node.id)
    if (at === undefined) throw new Error('Missing node geometry')
    const title = nodeTitle(node)
    const violations = props.violations[node.id] ?? 0
    parts.push(
      `<g${attributes({ 'data-node-id': node.id, transform: `translate(${at.x},${at.y})` })}>`,
      `<rect${attributes({
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        rx: 8,
        fill: nodeFill(node, props),
        stroke:
          node.change === 'added'
            ? '#1f6feb'
            : node.change === 'removed'
              ? '#b7473d'
              : node.id === props.focus
                ? '#1f6feb'
                : '#6b7280',
        'stroke-width': node.change === 'present' ? 1 : 3,
        'stroke-dasharray': node.change === 'removed' ? '5 4' : '',
      })}/>`,
      `<text x="12" y="20" fill="#4b5563" font-size="11">${escape(`«${props.kindOf(node)}» ${CHANGE_LABEL[node.change]}`)}</text>`,
      `<text x="12" y="44" fill="#1d1f21" font-size="14" font-weight="600">${escape(title.length > 34 ? title.slice(0, 31) + '…' : title)}</text>`,
      props.overlays.conformance && violations > 0
        ? `<circle cx="${NODE_WIDTH - 12}" cy="12" r="6" fill="#ad6100" data-conformance="deviation"/>`
        : '',
      `<text x="12" y="84" fill="#4b5563" font-size="11">${escape(nodeAnnotations(node, props).join(' · '))}</text>`,
      `<title>${escape(node.member ?? node.label)}</title></g>`,
    )
  }
  parts.push('</g>')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${selected.overview ? '系统总览图' : '当前架构子图'}" font-family="-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif">${parts.join('')}</svg>`
}
