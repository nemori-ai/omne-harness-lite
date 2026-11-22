import { definePart } from '@omne-harness/shell-contract'

export const mcpPage = definePart({
  name: 'mcp.page',
  label: 'MCP 页',
  summary: '资产页里 MCP 这一类的页面',
  within: 'assets.panel',
  depths: ['tokens', 'style'],
  when: '选中 MCP 页签且读到时',
})

export const mcpEndpoint = definePart({
  name: 'mcp.endpoint',
  label: '接入点',
  summary: '一个 MCP 接入点',
  within: 'mcp.page',
  depths: ['tokens', 'style'],
  when: '有接入点时',
})

export const mcpEndpointPermission = definePart({
  name: 'mcp.endpoint.permission',
  label: '调用权限',
  summary: '这个接入点的动作要不要先问你',
  within: 'mcp.endpoint',
  depths: ['tokens', 'style'],
  when: '这个接入点有权限的设置时',
})

export const mcpParts = [mcpPage, mcpEndpoint, mcpEndpointPermission] as const
