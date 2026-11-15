import type { ElkNode } from 'elkjs'
import type { RelationKind, SelectedArchitecture, ViewNode } from '../../../arch/view.ts'

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
  readonly violations: Readonly<Record<string, number>>
  readonly kindOf: (node: ViewNode) => string
  readonly onNode: (id: string) => void
  readonly onEdge: (id: string) => void
}

export interface FlowHandle {
  zoomIn(): void
  zoomOut(): void
  fitView(): void
  svg(): string
  unmount(): void
}

export interface ArchitectureFlowApi {
  mount(container: HTMLElement, props: FlowProps): FlowHandle
}
