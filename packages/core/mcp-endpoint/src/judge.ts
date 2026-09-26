import { isCapabilityName, type BodyJudgeContext } from '@omne-harness-lite/asset-model'
import { OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { modelName, validate as validateTool } from '@omne-harness-lite/tool-definition'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import { jsonValue, object } from './json.ts'
import { validate, type SchemaDefName } from './schema.ts'
import type { ActionEntryNameResult, McpJudgment, McpMalformedCode } from './types.ts'

const whitespace = new Set<number>(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS)
const accepted = Object.freeze({ ok: true } as const)
function malformed(code: McpMalformedCode): McpJudgment {
  return Object.freeze({ rejected: 'malformed', malformed: code })
}
function rejected(value: Exclude<McpJudgment, { ok: true }>['rejected']): McpJudgment {
  return Object.freeze({ rejected: value })
}
function has(value: JsonObject, key: string): boolean {
  return Object.hasOwn(value, key)
}
function missing(value: JsonObject, keys: readonly string[]): boolean {
  return keys.some(key => !has(value, key))
}
function extra(value: JsonObject, keys: readonly string[]): boolean {
  return Object.keys(value).some(key => !keys.includes(key))
}
function containsReservedSequence(value: string): boolean {
  return value.includes('__') || value.includes('_:') || value.includes(':_')
}
function endpointProjectable(value: string): boolean {
  return validateTool('ToolName', `${value}:a`).valid && modelName(`${value}:a`).length <= 128
}
function actionNameValid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 3 &&
    value.includes(':') &&
    validateTool('ToolName', value).valid &&
    modelName(value).length <= 128
  )
}
function allWhitespace(value: string): boolean {
  return Array.from(value).every(char => whitespace.has(char.codePointAt(0) ?? -1))
}
function validUrl(value: string): boolean {
  if (
    Array.from(value).some(char => {
      const code = char.codePointAt(0) ?? -1
      return whitespace.has(code) || code < 0x20 || (code >= 0x7f && code <= 0x9f)
    })
  )
    return false
  const match = /^https?:\/\/([^/?#\\]+)(?:[/?][^#]*)?$/u.exec(value)
  const authority = match?.[1]
  if (authority === undefined || authority.includes('@')) return false
  try {
    const url = new URL(value)
    return url.hostname.length > 0 && url.username === '' && url.password === '' && url.hash === ''
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}
function positiveDuration(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    validateTool('Duration', value).valid &&
    !/^PT(?:0+H)?(?:0+M)?(?:0+(?:[.]0+)?S)?$/u.test(value)
  )
}
function validInstant(value: unknown): boolean {
  return !('invalidInput' in instantFromRfc3339(value))
}
function opaqueId(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  const points = Array.from(value)
  const first = points[0]?.codePointAt(0)
  const last = points.at(-1)?.codePointAt(0)
  return (
    first !== undefined && last !== undefined && !whitespace.has(first) && !whitespace.has(last)
  )
}
function transportLate(value: JsonObject): McpMalformedCode | undefined {
  if (value.kind === 'stdio') {
    if (missing(value, ['command', 'args'])) return 'M3'
    if (extra(value, ['kind', 'command', 'args', 'env'])) return 'M4'
    if (
      typeof value.command !== 'string' ||
      !Array.isArray(value.args) ||
      !value.args.every(item => typeof item === 'string')
    )
      return 'M5'
    if (has(value, 'env')) {
      if (!object(value.env) || !Object.values(value.env).every(item => typeof item === 'string'))
        return 'M5'
      if (
        Object.entries(value.env).some(
          ([key, item]) =>
            key.length === 0 ||
            key.includes('=') ||
            key.includes('\0') ||
            (typeof item === 'string' && item.includes('\0')),
        )
      )
        return 'M9'
    }
  } else if (value.kind === 'streamable_http') {
    if (missing(value, ['url'])) return 'M3'
    if (extra(value, ['kind', 'url'])) return 'M4'
    if (typeof value.url !== 'string') return 'M5'
  }
  return undefined
}
function descriptorLate(value: JsonObject): McpMalformedCode | undefined {
  if (missing(value, ['name', 'inputSchema'])) return 'M3'
  if (typeof value.name !== 'string' || !object(value.inputSchema)) return 'M5'
  if (
    value.name.length === 0 ||
    (has(value, 'description') && typeof value.description !== 'string')
  )
    return 'M11'
  return undefined
}

/** S-20 predicates are ordered separately from Schema; no Ajv error-to-rejection mapping. */
export function judgeMcpValue(
  definition: SchemaDefName,
  value: unknown,
  context?: BodyJudgeContext,
): McpJudgment {
  const data = jsonValue(value)
  if (definition === 'McpEndpointName') {
    if (!isCapabilityName(data)) return rejected('name_invalid')
    return endpointProjectable(data) ? accepted : rejected('name_not_projectable')
  }
  if (definition === 'McpActionName') {
    if (typeof data === 'string' && data.length > 0 && containsReservedSequence(data))
      return rejected('name_reserved_sequence')
    return actionNameValid(data) ? accepted : malformed('M13')
  }
  if (!object(value)) return malformed('M1')
  if (data === undefined || !object(data)) return malformed('M5')
  const transport =
    definition === 'McpEndpoint' ? data.transport : definition === 'McpTransport' ? data : undefined
  if (transport !== undefined && !object(transport)) return malformed('M1')
  if (
    definition === 'ActionSnapshot' &&
    data.kind === 'fetched' &&
    Array.isArray(data.tools) &&
    data.tools.some(item => !object(item))
  )
    return malformed('M1')
  if (object(transport) && !has(transport, 'kind')) return malformed('M2')
  if (definition === 'ActionSnapshot' && !has(data, 'kind')) return malformed('M2')
  if (object(transport) && transport.kind !== 'stdio' && transport.kind !== 'streamable_http')
    return rejected('transport_unknown')
  if (
    object(transport) &&
    transport.kind === 'stdio' &&
    typeof transport.command === 'string' &&
    allWhitespace(transport.command)
  )
    return rejected('command_empty')
  if (
    object(transport) &&
    transport.kind === 'streamable_http' &&
    typeof transport.url === 'string' &&
    !validUrl(transport.url)
  )
    return rejected('url_invalid')
  if (definition === 'ActionSnapshot' && data.kind === 'fetched' && !has(data, 'fetchedAt'))
    return rejected('snapshot_missing_time')
  if (definition === 'McpEndpoint' && context?.capabilityName !== undefined) {
    if (!isCapabilityName(context.capabilityName)) return rejected('name_invalid')
    if (!endpointProjectable(context.capabilityName)) return rejected('name_not_projectable')
  }
  let late: McpMalformedCode | undefined
  if (definition === 'McpTransport' && object(transport)) late = transportLate(transport)
  if (definition === 'McpEndpoint') {
    if (missing(data, ['transport', 'timeouts', 'permissions'])) return malformed('M3')
    if (extra(data, ['transport', 'timeouts', 'permissions'])) return malformed('M4')
    if (!object(data.timeouts) || !object(data.permissions)) return malformed('M5')
    if (missing(data.timeouts, ['connect', 'call']) || !has(data.permissions, 'execute'))
      return malformed('M3')
    if (!object(data.permissions.execute)) return malformed('M5')
    if (!has(data.permissions.execute, 'default')) return malformed('M3')
    if (
      extra(data.timeouts, ['connect', 'call']) ||
      extra(data.permissions, ['execute']) ||
      extra(data.permissions.execute, ['default'])
    )
      return malformed('M4')
    if (object(transport)) late = transportLate(transport)
    if (late !== undefined) return malformed(late)
    const executeDefault = data.permissions.execute.default
    if (!['forbid', 'auto', 'ask'].some(item => item === executeDefault)) return malformed('M6')
    if (!positiveDuration(data.timeouts.connect) || !positiveDuration(data.timeouts.call))
      return malformed('M8')
  }
  if (definition === 'ActionSnapshot') {
    if (data.kind !== 'fetched' && data.kind !== 'not_fetched') return malformed('M6')
    if (data.kind === 'not_fetched') {
      if (extra(data, ['kind'])) return malformed('M4')
    } else {
      if (!has(data, 'tools')) return malformed('M3')
      if (extra(data, ['kind', 'tools', 'fetchedAt'])) return malformed('M4')
      if (!Array.isArray(data.tools)) return malformed('M5')
      if (!validInstant(data.fetchedAt)) return malformed('M7')
      const names = new Set<string>()
      for (const tool of data.tools) {
        if (!object(tool)) return malformed('M1')
        const code = descriptorLate(tool)
        if (code !== undefined) return malformed(code)
        if (typeof tool.name !== 'string') return malformed('M5')
        if (names.has(tool.name)) return malformed('M10')
        names.add(tool.name)
      }
    }
  }
  if (definition === 'McpToolDescriptor') late = descriptorLate(data)
  if (definition === 'OAuthBinding') {
    if (missing(data, ['id', 'state', 'since'])) return malformed('M3')
    if (extra(data, ['id', 'state', 'since'])) return malformed('M4')
    if (typeof data.id !== 'string') return malformed('M5')
    if (!['pending', 'granted', 'revoked'].some(item => item === data.state)) return malformed('M6')
    if (!validInstant(data.since)) return malformed('M7')
    if (!opaqueId(data.id)) return malformed('M12')
  }
  if (late !== undefined) return malformed(late)
  if (!validate(definition, data).valid)
    throw new Error(`unmapped MCP representation failure for ${definition}`)
  return accepted
}

export function judgeMcpEndpoint(value: unknown, context?: BodyJudgeContext): McpJudgment {
  return judgeMcpValue('McpEndpoint', value, context)
}

/** S-11 is forward construction only; no entry-name decoder exists. */
export function actionEntryName(endpointName: string, remoteName: string): ActionEntryNameResult {
  if (
    !isCapabilityName(endpointName) ||
    !endpointProjectable(endpointName) ||
    typeof remoteName !== 'string' ||
    remoteName.length === 0
  )
    return Object.freeze({ notProjectable: true })
  const name = `${endpointName}:${remoteName}`
  return actionNameValid(name)
    ? Object.freeze({ ok: name })
    : Object.freeze({ notProjectable: true })
}
