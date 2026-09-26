import { expectTypeOf } from 'vitest'
import type { BodyContract } from '@omne-harness-lite/asset-model'
import type {
  BlockId,
  CallId,
  JsonNumber,
  ModelToolName as ContentName,
} from '@omne-harness-lite/content-blocks'
import { toolBodyContract, toolDependencies } from '../src/index.ts'
import type {
  ModelToolName,
  ToolDefinition,
  ToolResult,
  ToolReturn,
  ToolSettings,
} from '../src/index.ts'

expectTypeOf<ModelToolName>().toEqualTypeOf<ContentName>()
expectTypeOf<ToolSettings['concurrency']>().toEqualTypeOf<
  { readonly category: 'preference'; readonly default: JsonNumber } | undefined
>()
expectTypeOf(toolBodyContract).toEqualTypeOf<BodyContract<'tool'>>()
declare const definition: ToolDefinition
toolDependencies(definition, undefined)
// @ts-expect-error S19 requires the caller to explicitly pass the effective input
toolDependencies(definition)
// @ts-expect-error different category cannot occupy the tool slot
const wrongPort: BodyContract<'skill'> = toolBodyContract
declare const id: BlockId
declare const callId: CallId
const callResult = {
  content: [
    {
      kind: 'tool_call',
      id,
      visibility: { toHuman: true, toModel: true },
      tool: 't',
      callId,
      arguments: {},
      complete: true,
    },
  ],
} as const
// @ts-expect-error returned content cannot start a tool call
const result: ToolResult = callResult
// @ts-expect-error result is content, not an execution settlement
const settlement: ToolResult = { content: [], outcome: 'failed' }
const executable: ToolDefinition = {
  name: 't',
  description: 'd',
  paradigm: 'single',
  input: { type: 'object', properties: {} },
  permissions: { execute: { default: 'ask' } },
  origin: { kind: 'authored' },
  // @ts-expect-error executable state does not belong in a definition
  implementation: () => 1,
}
// @ts-expect-error multi owns commands, not a second input schema
const twoAuthorities: ToolDefinition = {
  name: 't',
  description: 'd',
  paradigm: 'multi',
  commands: { go: { description: 'd', input: { type: 'object', properties: {} } } },
  input: { type: 'object', properties: {} },
  permissions: { execute: { default: 'ask' } },
  origin: { kind: 'authored' },
}
const mcpComposes = {
  name: 't',
  description: 'd',
  paradigm: 'single',
  input: { type: 'object', properties: {} },
  permissions: { execute: { default: 'ask' } },
  origin: { kind: 'mcp', endpoint: { category: 'mcp', name: 'ep' }, remoteName: 'go' },
  composes: { skills: ['skill'] },
} as const
// @ts-expect-error MCP tools cannot compose assets
const mcpComposition: ToolDefinition = mcpComposes
// @ts-expect-error no new third return variant
const absentReturn: ToolReturn = null
void wrongPort
void result
void settlement
void executable
void twoAuthorities
void mcpComposition
void absentReturn
