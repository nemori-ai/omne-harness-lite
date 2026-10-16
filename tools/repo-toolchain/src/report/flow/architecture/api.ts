import type { ElkNode } from 'elkjs'
import type { RelationKind, SelectedArchitecture, ViewNode } from '../../../arch/view.ts'

/** What the vanilla page hands to the React island. Geometry comes from ELK, never from the island. */
export interface FlowProps {
  readonly selected: SelectedArchitecture
  readonly layout: ElkNode
  readonly relations: Readonly<Record<RelationKind, string>>
  readonly focus: string
  readonly overlays: {
    readonly complexity: boolean
    readonly coupling: boolean
    readonly conformance: boolean
  }
  /** Static conformance deviations per node id, computed by the page from the conformance rows. */
  readonly violations: Readonly<Record<string, number>>
  readonly kindOf: (node: ViewNode) => string
  readonly onNode: (id: string) => void
  readonly onEdge: (id: string) => void
}

export interface FlowHandle {
  zoomIn(): void
  zoomOut(): void
  fitView(): void
  /** The full current subgraph with legend as a standalone SVG document, independent of the viewport. */
  svg(): string
  unmount(): void
}

/** Exposed as `window.ArchitectureFlow` by the inlined bundle. */
export interface ArchitectureFlowApi {
  mount(container: HTMLElement, props: FlowProps): FlowHandle
}
