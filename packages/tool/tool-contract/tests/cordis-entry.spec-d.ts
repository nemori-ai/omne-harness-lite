// Compile-time checks of the `./cordis` augmentation. Each `@ts-expect-error` names the
// diagnostic that the accepted types must produce.
import type { Context, Events } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import { expectTypeOf, it } from 'vitest'
import type { ToolCallId, ToolOperationId, ToolRevision } from '@omne-harness/tool-contract'
import {
  toolCommandsKey,
  toolRuntimeKey,
  type ToolCommandsService,
  type ToolRuntimeService,
} from '@omne-harness/tool-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'

declare const ctx: Context
declare const tenant: TenantId
declare const call: ToolCallId
declare const operation: ToolOperationId
declare const revision: ToolRevision

it('types the injected Tool services on the context', () => {
  expectTypeOf(ctx.toolRuntime).toEqualTypeOf<ToolRuntimeService<unknown, ContentBlock>>()
  expectTypeOf(ctx.toolCommands).toEqualTypeOf<ToolCommandsService<unknown, ContentBlock>>()
  expectTypeOf<typeof toolRuntimeKey>().toEqualTypeOf<'toolRuntime'>()
  expectTypeOf<typeof toolCommandsKey>().toEqualTypeOf<'toolCommands'>()
})

it('carries only tenant, call and revision on tool/call-changed', () => {
  expectTypeOf<Parameters<Events['tool/call-changed']>>().toEqualTypeOf<
    [tenant: TenantId, call: ToolCallId, revision: ToolRevision]
  >()
  void ctx.parallel('tool/call-changed', tenant, call, revision)
  // @ts-expect-error TS2769: No overload matches, because 'ToolOperationId' is not assignable to parameter 'call' of type 'ToolCallId'.
  void ctx.parallel('tool/call-changed', tenant, operation, revision)
})
