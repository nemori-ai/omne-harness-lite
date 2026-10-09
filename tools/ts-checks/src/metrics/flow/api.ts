import type { Report } from '../report.ts'
import type { EdgeState } from './edges.ts'

/** 原生页面交给结构图岛的东西。几何与画哪些线都由本目录的纯函数从 report 算出。 */
export interface StructureProps {
  readonly report: Report
  readonly changedEdgeLimit: number
  readonly onSelect: (path: string | null) => void
  readonly onHover: (event: MouseEvent, path: string) => void
  readonly onLeave: () => void
}

export interface StructureHandle {
  /** 换选中成员或组线开关后重画；返回变更边超过上限时的说明，没有时为空串。 */
  update(state: Omit<EdgeState, 'limit'>): string
  zoomIn(): void
  zoomOut(): void
  fitView(): void
  unmount(): void
}

/** 内联 bundle 设为 `window.StructureFlow`。 */
export interface StructureFlowApi {
  mount(container: HTMLElement, props: StructureProps): StructureHandle
}
