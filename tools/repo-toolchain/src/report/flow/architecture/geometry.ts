import type { ElkNode, ElkExtendedEdge } from 'elkjs'

export const NODE_WIDTH = 270
export const NODE_HEIGHT = 100

export interface EdgeRoute {
  readonly d: string
  readonly labels: readonly { readonly x: number; readonly y: number; readonly text: string }[]
}

/** ELK routed sections as one SVG path. Coordinates are root-relative because the graph has no nesting. */
export function routeOf(edge: ElkExtendedEdge): EdgeRoute {
  if (edge.sections === undefined || edge.sections.length === 0)
    throw new Error('Missing edge route')
  const d = edge.sections
    .map(section =>
      [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
        .join(' '),
    )
    .join(' ')
  const labels = (edge.labels ?? []).map(label => {
    if (label.x === undefined || label.y === undefined) throw new Error('Missing edge label')
    return {
      x: label.x + (label.width ?? 0) / 2,
      y: label.y + (label.height ?? 0) / 2,
      text: label.text ?? '',
    }
  })
  return { d, labels }
}

export function positionsOf(layout: ElkNode): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  for (const node of layout.children ?? []) {
    if (node.x === undefined || node.y === undefined) throw new Error('Missing node position')
    positions.set(node.id, { x: node.x, y: node.y })
  }
  return positions
}

export function routesOf(layout: ElkNode): Map<string, EdgeRoute> {
  return new Map((layout.edges ?? []).map(edge => [edge.id, routeOf(edge)]))
}
