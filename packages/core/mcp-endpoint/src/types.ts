import type { CapabilityName } from '@omne-harness-lite/asset-model'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type { Duration, ExecutePermission, ToolName } from '@omne-harness-lite/tool-definition'

export type McpTransport =
  | {
      readonly kind: 'stdio'
      readonly command: string
      readonly args: readonly string[]
      readonly env?: Readonly<Record<string, string>>
    }
  | { readonly kind: 'streamable_http'; readonly url: string }

export type McpEndpoint = {
  readonly transport: McpTransport
  readonly timeouts: { readonly connect: Duration; readonly call: Duration }
  readonly permissions: { readonly execute: ExecutePermission }
}

/** Protocol extensions remain JSON data; inputSchema is not compiled at this boundary. */
export type McpToolDescriptor = JsonObject & {
  readonly name: string
  readonly inputSchema: JsonObject
  readonly description?: string
}

export type ActionSnapshot =
  | {
      readonly kind: 'fetched'
      readonly fetchedAt: string
      readonly tools: readonly McpToolDescriptor[]
    }
  | { readonly kind: 'not_fetched' }

export type McpActionName = ToolName
export type McpEndpointName = CapabilityName
export type OAuthBinding = {
  readonly id: string
  readonly state: 'pending' | 'granted' | 'revoked'
  readonly since: string
}

export type McpRejection =
  | 'malformed'
  | 'transport_unknown'
  | 'command_empty'
  | 'url_invalid'
  | 'snapshot_missing_time'
  | 'name_not_projectable'
  | 'name_reserved_sequence'
export type McpMalformedCode = `M${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13}`
/** name_invalid is carried from asset-model for base CapabilityName violations. */
export type McpJudgment =
  | { readonly ok: true }
  | { readonly rejected: McpRejection | 'name_invalid'; readonly malformed?: McpMalformedCode }
export type ActionEntryNameResult =
  { readonly ok: McpActionName } | { readonly notProjectable: true }
