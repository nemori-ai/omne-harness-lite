/// <reference lib="dom" />
import { createRoot } from 'react-dom/client'
import type { ArchitectureFlowApi, FlowHandle, FlowProps } from './api.ts'
import { architectureSvg } from './export-svg.ts'
import { elementsOf, Graph, type ArchInstance } from './graph.tsx'

declare global {
  interface Window {
    ArchitectureFlow?: ArchitectureFlowApi
  }
}

const api: ArchitectureFlowApi = {
  mount(container: HTMLElement, props: FlowProps): FlowHandle {
    // Geometry problems throw here, before React renders, so the page can show the failure state.
    const elements = elementsOf(props)
    const root = createRoot(container)
    const instance: { current: ArchInstance | null } = { current: null }
    root.render(<Graph props={props} elements={elements} instance={instance} />)
    return {
      zoomIn: () => void instance.current?.zoomIn({ duration: 180 }),
      zoomOut: () => void instance.current?.zoomOut({ duration: 180 }),
      fitView: () => void instance.current?.fitView({ padding: 0.12, maxZoom: 1.2, duration: 220 }),
      svg: () => architectureSvg(props),
      unmount: () => root.unmount(),
    }
  },
}

window.ArchitectureFlow = api
