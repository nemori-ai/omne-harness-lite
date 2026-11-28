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

export const mcpEndpointStatus = definePart({
  name: 'mcp.endpoint.status',
  label: '状态',
  summary: '这个接入点连上没有，不能用时为什么',
  within: 'mcp.endpoint',
  depths: ['tokens', 'style'],
  when: '有接入点时',
})

export const mcpEndpointActions = definePart({
  name: 'mcp.endpoint.actions',
  label: '动作清单',
  summary: '这个接入点的动作，或清单为什么还没取得',
  within: 'mcp.endpoint',
  depths: ['tokens', 'style'],
  when: '这个接入点的状态读到时',
})

export const mcpEndpointConnect = definePart({
  name: 'mcp.endpoint.connect',
  label: '连接',
  summary: 'OAuth 接入点在浏览器里连上、等你同意或断开',
  within: 'mcp.endpoint',
  depths: ['tokens', 'style'],
  when: '这个接入点用 OAuth 且状态读到时',
})

export const mcpParts = [
  mcpPage,
  mcpEndpoint,
  mcpEndpointPermission,
  mcpEndpointStatus,
  mcpEndpointConnect,
  mcpEndpointActions,
] as const
