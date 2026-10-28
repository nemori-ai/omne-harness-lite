import { expectTypeOf, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  Adoption,
  FixedToolRequest,
  ToolEnvironmentDeclaration,
  ToolDeclarations,
  ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import type { ToolCommands, ToolEnvironment } from '@omne-harness/tool-contract/provider'

it('requires the public RC scope independently of resource scope and workspace', () => {
  expectTypeOf<ToolInvokeRequest['requesterScope']>().toEqualTypeOf<ScopeRef>()
  expectTypeOf<FixedToolRequest['requesterScope']>().toEqualTypeOf<ScopeRef>()
  expectTypeOf<Omit<ToolInvokeRequest, 'requesterScope'>>().not.toExtend<ToolInvokeRequest>()
  expectTypeOf<ToolInvokeRequest['scope']>().not.toExtend<ScopeRef>()
})

it('carries the same declaration slot through author facts and the fixed request', () => {
  expectTypeOf<ToolDeclarations['environment']>().toEqualTypeOf<ToolEnvironmentDeclaration | null>()
  expectTypeOf<FixedToolRequest['environment']>().toEqualTypeOf<ToolDeclarations['environment']>()
  expectTypeOf<Adoption>().not.toExtend<ToolEnvironmentDeclaration>()
})

it('requires a separate adapter adoption when planning a preparation', () => {
  type Plan = Parameters<ToolCommands<string, ContentBlock>['planPreparation']>[0]
  expectTypeOf<Plan['environmentAdoption']>().toEqualTypeOf<
    ToolEnvironment<string, unknown>['adoption']
  >()
  expectTypeOf<Omit<Plan, 'environmentAdoption'>>().not.toExtend<Plan>()
})
