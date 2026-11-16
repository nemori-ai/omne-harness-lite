import type { PlainJson, PlainRecord } from './plain.ts'
import { isModernProtocolVersion } from './revisions.ts'

export const PROTOCOL_VERSION_KEY = 'io.modelcontextprotocol/protocolVersion'
export const CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities'
export const CLIENT_INFO_KEY = 'io.modelcontextprotocol/clientInfo'
export const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo'
export const LOG_LEVEL_KEY = 'io.modelcontextprotocol/logLevel'
export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'

export type ClientInfo = Readonly<{ name: string; version: string }>

const MODERN_CAPABILITIES: PlainJson = {
  extensions: { [TASKS_EXTENSION]: {} },
  elicitation: { form: {} },
}
const LEGACY_CAPABILITIES: PlainJson = {}

export function clientEnvelopeOf(version: string, clientInfo: ClientInfo): PlainRecord {
  return {
    [PROTOCOL_VERSION_KEY]: version,
    [CLIENT_CAPABILITIES_KEY]: isModernProtocolVersion(version)
      ? MODERN_CAPABILITIES
      : LEGACY_CAPABILITIES,
    [CLIENT_INFO_KEY]: { name: clientInfo.name, version: clientInfo.version },
  }
}

const MCP_NAME_SOURCES: Readonly<{ [method: string]: string }> = {
  'tools/call': 'name',
  'tasks/get': 'taskId',
  'tasks/update': 'taskId',
  'tasks/cancel': 'taskId',
}

export type McpRequestHeaders = Readonly<{
  'mcp-protocol-version': string
  'mcp-method': string
  'mcp-name'?: string
  'mcp-session-id'?: string
}>

function isSafeFieldValue(value: string): boolean {
  if (value === '' || value.startsWith('=?')) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code > 0x7e) return false
  }
  return value.trim() === value
}

export function encodeMcpHeaderValue(value: string): string {
  if (isSafeFieldValue(value)) return value
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return `=?base64?${btoa(binary)}?=`
}

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
