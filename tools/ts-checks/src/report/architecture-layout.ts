import type { ElkNode } from 'elkjs'
import type { SelectedArchitecture, RelationKind } from '../arch/view.ts'

/** Geometry only. Self-contained so the offline page uses the same adapter. */
export function architectureLayoutInput(
  selected: SelectedArchitecture,
  relations: Readonly<Record<RelationKind, string>>,
): ElkNode {
  return {
    id: 'architecture-layout',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.padding': '[top=32,left=24,bottom=32,right=24]',
      'elk.randomSeed': '1',
    },
    children: selected.nodes.map(node => ({ id: node.id, width: 270, height: 100 })),
    edges: selected.edges.map(edge => {
      const name = relations[edge.kind]
      const suffix = selected.overview ? ` · ${edge.evidence.length}` : edge.label
      const text = (name + (suffix === '' ? '' : ' ' + suffix)).slice(0, 42)
      return {
        id: edge.id,
        sources: [edge.from],
        targets: [edge.to],
        labels: [{ text, width: [...text].length * 10, height: 18 }],
      }
    }),
  }
}
