import { expectTypeOf } from 'vitest'
import type { BodyContract, CapabilityName } from '@omne-harness-lite/asset-model'
import type { JsonObject } from '@omne-harness-lite/content-blocks'
import type { ToolName, Duration } from '@omne-harness-lite/tool-definition'
import { actionEntryName, deriveMcpDeclarations, mcpBodyContract } from '../src/index.ts'
import type {
  McpActionName,
  McpEndpointName,
  McpEndpoint,
  McpToolDescriptor,
  ActionSnapshot,
  OAuthBinding,
  McpDeclarations,
} from '../src/index.ts'
expectTypeOf<McpActionName>().toEqualTypeOf<ToolName>()
expectTypeOf<McpEndpointName>().toEqualTypeOf<CapabilityName>()
expectTypeOf<McpEndpoint['timeouts']['call']>().toEqualTypeOf<Duration>()
expectTypeOf<McpToolDescriptor['inputSchema']>().toEqualTypeOf<JsonObject>()
expectTypeOf(actionEntryName).parameters.toEqualTypeOf<[endpoint: string, remoteName: string]>()
const body: McpEndpoint = {
  transport: { kind: 'stdio', command: 's', args: [] },
  timeouts: { connect: 'PT1S', call: 'PT1S' },
  permissions: { execute: { default: 'ask' } },
  // @ts-expect-error authored bodies do not own action state
  actions: { kind: 'not_fetched' },
}
// @ts-expect-error unknown is distinct from an explicit empty list
const unknown: ActionSnapshot = { kind: 'not_fetched', tools: [] }
// @ts-expect-error fetched requires the actual observation time
const timeless: ActionSnapshot = { kind: 'fetched', tools: [] }
// @ts-expect-error protocol inputSchema is an object, never boolean
const descriptor: McpToolDescriptor = { name: 'run', inputSchema: true }
const oauth: OAuthBinding = {
  id: 'id',
  state: 'granted',
  since: '2026-01-01T00:00:00Z',
  // @ts-expect-error OAuth tokens belong to a custodian, not a binding
  accessToken: 'token',
}
void body
void unknown
void timeless
void descriptor
void oauth

expectTypeOf<McpDeclarations['actionSnapshotKind']>().toEqualTypeOf<
  ActionSnapshot['kind'] | undefined
>()
expectTypeOf(mcpBodyContract).toEqualTypeOf<BodyContract<'mcp'>>()
const typedDerive: (body: McpEndpoint, actionSnapshot?: ActionSnapshot) => McpDeclarations =
  deriveMcpDeclarations
// @ts-expect-error category-specific MCP port cannot occupy the tool slot
const wrongSlot: BodyContract<'tool'> = mcpBodyContract
// @ts-expect-error provenance is a mandatory own property even when no snapshot was supplied
const missingProvenance: McpDeclarations = { declarations: [] }
void wrongSlot
void missingProvenance
void typedDerive
