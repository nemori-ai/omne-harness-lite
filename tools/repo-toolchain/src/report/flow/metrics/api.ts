import type { Report } from '../../../metrics/report.ts'
import type { EdgeState } from './edges.ts'

export interface StructureProps {
  readonly report: Report
  readonly changedEdgeLimit: number
  readonly onSelect: (path: string | null) => void
  readonly onHover: (event: MouseEvent, path: string) => void
  readonly onLeave: () => void
}

export interface StructureHandle {
  update(state: Omit<EdgeState, 'limit'>): string
  zoomIn(): void
  zoomOut(): void
  fitView(): void
  unmount(): void
}

export interface StructureFlowApi {
  mount(container: HTMLElement, props: StructureProps): StructureHandle
}
