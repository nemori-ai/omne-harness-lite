export {
  commandOf,
  commandText,
  endpointTool,
  MCP_INVOKE_GATE,
  MCP_SOURCE_PREFIX,
  mcpActionExecutor,
  PEER_MARK,
  PEER_TEXT_BEGIN,
  PEER_TEXT_END,
  type BridgeShape,
  type EndpointTool,
  type UnadmittedAction,
  type UnadmittedReason,
} from './convert.ts'
export { failureText, settle, type BridgeResult, type Settlement } from './outcome.ts'
export { createMcpEntrySource, type McpBridgeDependencies } from './source.ts'
