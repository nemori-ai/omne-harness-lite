// Compile-time checks of the `./cordis` augmentation. Each `@ts-expect-error` names the
// diagnostic that the accepted types must produce.
import type { Context, Events } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import { expectTypeOf, it } from 'vitest'
import type { ToolCallId, ToolOperationId, ToolRevision } from '@omne-harness/tool-contract'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import {
  toolCommandsKey,
  toolRuntimeKey,
  type ToolAuthorityFailure,
  type ToolCommandsService,
  type ToolContributionAuthority,
  type ToolRuntimeService,
  type VerifiedAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'

declare const ctx: Context
declare const tenant: TenantId
declare const call: ToolCallId
declare const operation: ToolOperationId
declare const revision: ToolRevision
declare const authority: ToolAuthority

it('types the injected Tool services on the context', () => {
  expectTypeOf(ctx.toolRuntime).toEqualTypeOf<ToolRuntimeService<unknown, ContentBlock>>()
  expectTypeOf(ctx.toolCommands).toEqualTypeOf<ToolCommandsService<unknown, ContentBlock>>()
  expectTypeOf<typeof toolRuntimeKey>().toEqualTypeOf<'toolRuntime'>()
  expectTypeOf<typeof toolCommandsKey>().toEqualTypeOf<'toolCommands'>()
})

it('carries only tenant, call and revision on tool-cordis-contract/call-changed', () => {
  expectTypeOf<Parameters<Events['tool-cordis-contract/call-changed']>>().toEqualTypeOf<
    [tenant: TenantId, call: ToolCallId, revision: ToolRevision]
  >()
  void ctx.parallel('tool-cordis-contract/call-changed', tenant, call, revision)
  // @ts-expect-error TS2769: No overload matches, because 'ToolOperationId' is not assignable to parameter 'call' of type 'ToolCallId'.
  void ctx.parallel('tool-cordis-contract/call-changed', tenant, operation, revision)
})

it('brands VerifiedAuthority so that only verify produces it', () => {
  expectTypeOf<VerifiedAuthority>().toExtend<ToolAuthority>()
  expectTypeOf<ToolAuthority>().not.toExtend<VerifiedAuthority>()
  expectTypeOf<ReturnType<ToolContributionAuthority<unknown>['verify']>>().toEqualTypeOf<
    Outcome<VerifiedAuthority, ToolAuthorityFailure>
  >()
  // @ts-expect-error TS2322: a plain ToolAuthority lacks the brand of the origin check.
  const forged: VerifiedAuthority = authority
  void forged
})
