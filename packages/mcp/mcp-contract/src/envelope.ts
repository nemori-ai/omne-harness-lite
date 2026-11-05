// The per-request `_meta` envelope and the MCP request headers of SPEC T3. One implementation:
// the scripted transport and the real transports compose requests with these.
import type { PlainJson, PlainRecord } from './plain.ts'
import { isModernProtocolVersion } from './revisions.ts'

export const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion'
export const CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities'
export const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo'
export const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo'
export const LOG_LEVEL_KEY = 'io.modelcontextprotocol/logLevel'
export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'

export type ClientInfo = Readonly<{ name: string; version: string }>

/** The capabilities a modern revision declares (T3): the tasks extension and form elicitation. */
const MODERN_CAPABILITIES: PlainJson = {
  extensions: { [TASKS_EXTENSION]: {} },
  elicitation: { form: {} },
}
/** A legacy revision declares no capability (T3). */
const LEGACY_CAPABILITIES: PlainJson = {}

/**
 * The `_meta` of one request or notification (T3): the protocol version, the client capabilities
 * of that revision, and the client info.
 */
export function clientEnvelopeOf(version: string, clientInfo: ClientInfo): PlainRecord {
  return {
    [PROTOCOL_VERSION_KEY]: version,
    [CLIENT_CAPABILITIES_KEY]: isModernProtocolVersion(version)
      ? MODERN_CAPABILITIES
      : LEGACY_CAPABILITIES,
    [CLIENT_INFO_KEY]: { name: clientInfo.name, version: clientInfo.version },
  }
}

/** The request field that `Mcp-Name` mirrors, by method (T3; SEP-2243, SEP-2663). */
const MCP_NAME_SOURCES: Readonly<{ [method: string]: string }> = {
  'tools/call': 'name',
  'tasks/get': 'taskId',
  'tasks/update': 'taskId',
  'tasks/cancel': 'taskId',
}

/** The MCP request headers of one Streamable HTTP request or notification, by lower-case name. */
export type McpRequestHeaders = Readonly<{
  'mcp-protocol-version': string
  'mcp-method': string
  'mcp-name'?: string
  'mcp-session-id'?: string
}>

/**
 * True for a value that an HTTP field carries as it is (SEP-2243 value encoding): visible ASCII
 * without the sentinel prefix, with inner spaces allowed.
 */
function isSafeFieldValue(value: string): boolean {
  if (value === '' || value.startsWith('=?')) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code > 0x7e) return false
  }
  return value.trim() === value
}

/**
 * The value of `Mcp-Name` for a name: as it is when it is a safe field value, otherwise the
 * base64 of its UTF-8 wrapped as `=?base64?…?=` (SEP-2243 "Value Encoding").
 */
export function encodeMcpHeaderValue(value: string): string {
  if (isSafeFieldValue(value)) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return `=?base64?${btoa(binary)}?=`
}

/**
 * The MCP headers of one request or notification on Streamable HTTP (T3): `MCP-Protocol-Version`
 * is the version of its `_meta`, `Mcp-Method` the method, `Mcp-Name` the mirrored field of the
 * methods that have one, and `Mcp-Session-Id` the legacy session, which `initialize` never carries.
 */
export function mcpRequestHeadersOf(
  method: string,
  params: PlainRecord,
  version: string,
  session?: string,
): McpRequestHeaders {
  const source = MCP_NAME_SOURCES[method]
  const name = source === undefined ? undefined : params[source]
  return {
    'mcp-protocol-version': version,
    'mcp-method': method,
    ...(typeof name === 'string' ? { 'mcp-name': encodeMcpHeaderValue(name) } : {}),
    ...(session === undefined || method === 'initialize' ? {} : { 'mcp-session-id': session }),
  }
}
