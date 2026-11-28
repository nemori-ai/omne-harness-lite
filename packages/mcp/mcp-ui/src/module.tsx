import { mcpProtocol } from '@omne-harness/mcp-protocol'
import {
  needPoint,
  needProtocol,
  type KeyedPoint,
  type PointSink,
  type ServiceKey,
} from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { McpCreateForm } from './create-form.tsx'
import { MCP_CATEGORY, McpPage } from './mcp-page.tsx'
import { mcpParts } from './parts.ts'
import type { McpGovernance, McpStatus } from './port.ts'

export type McpUiOptions = Readonly<{
  page: PointSink<unknown>
  governance: ServiceKey<McpGovernance>
  /** Where a category gives its form under 新建 on the assets page; without it the generic form is drawn. */
  createForm?: KeyedPoint<Readonly<{ category: string }>>
}>

export function createMcpUiModule({ page, governance, createForm }: McpUiOptions) {
  return defineUiModule({
    name: 'mcp-ui',
    needs: {
      governance: needPoint(governance),
      status: needProtocol<McpStatus | null>(mcpProtocol, { optional: true }),
    },
    apply(shell, bound) {
      for (const part of mcpParts) part.declare(shell)
      const port = bound.governance.get()
      if (port === undefined) return
      const status = bound.status ?? null
      page.contribute(shell, {
        id: MCP_CATEGORY,
        order: 0,
        label: 'MCP',
        render: ({ scope }) =>
          scope === undefined ? null : <McpPage governance={port} tenant={scope} status={status} />,
      })
      createForm?.contribute(shell, MCP_CATEGORY, {
        id: 'mcp-ui.create',
        order: 0,
        render: ({ scope }) =>
          scope === undefined ? null : <McpCreateForm governance={port} tenant={scope} />,
      })
    },
  })
}
