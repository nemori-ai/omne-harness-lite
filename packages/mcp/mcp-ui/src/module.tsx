import { serviceOf, type PointSink, type ServiceKey } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { MCP_CATEGORY, McpPage } from './mcp-page.tsx'
import type { McpGovernance } from './port.ts'

export type McpUiOptions = Readonly<{
  page: PointSink<unknown>
  governance: ServiceKey<McpGovernance>
}>

export function createMcpUiModule({ page, governance }: McpUiOptions) {
  return defineUiModule({
    name: 'mcp-ui',
    inject: [governance],
    apply(shell, services) {
      const port = serviceOf(services, governance)
      page.contribute(shell, {
        id: MCP_CATEGORY,
        order: 0,
        label: 'MCP',
        render: ({ scope }) =>
          scope === undefined ? null : <McpPage governance={port} tenant={scope} />,
      })
    },
  })
}
