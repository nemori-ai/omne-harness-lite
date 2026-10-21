import { expectTypeOf, it } from 'vitest'
import {
  createTools,
  type Tools,
  type ToolsAccess,
  type ToolsOptions,
  type ToolsReadRuntime,
} from '@omne-harness/tool'
import type {
  Access,
  InvocationAccess,
  Reply,
  ToolAuthorRegistration,
  ToolMessageContentBlock,
  ToolResult,
  ToolResultVersion,
  ToolRuntime,
} from '@omne-harness/tool-contract'

it('createTools consumes only the public result and content read ports', () => {
  type P = { subject: string }
  expectTypeOf(createTools<P>).parameters.toEqualTypeOf<[ToolsReadRuntime<P>, ToolsOptions]>()
  expectTypeOf(createTools<P>).returns.toEqualTypeOf<Tools<P>>()
  expectTypeOf<ToolsAccess<P>>().toEqualTypeOf<
    InvocationAccess<P> & Readonly<{ result: ToolResultVersion }>
  >()
  expectTypeOf<ToolsReadRuntime<P>>().toEqualTypeOf<
    Readonly<{
      queries: Pick<ToolRuntime<P, ToolMessageContentBlock>['queries'], 'readResult'>
      content: Pick<ToolRuntime<P, ToolMessageContentBlock>['content'], 'read'>
    }>
  >()
  expectTypeOf<Tools<P>['author']>().toEqualTypeOf<
    ToolAuthorRegistration<Access<P>, ToolMessageContentBlock>
  >()
  expectTypeOf<Tools<P>['present']>().toEqualTypeOf<
    (input: ToolsAccess<P>) => Promise<ToolResult<ToolMessageContentBlock>>
  >()
  expectTypeOf<Tools<P>['readReply']>().toEqualTypeOf<
    (input: ToolsAccess<P>) => Reply<ToolResult<ToolMessageContentBlock>>
  >()
  expectTypeOf<Extract<'invoke', keyof ToolsReadRuntime<P>>>().toEqualTypeOf<never>()
  expectTypeOf<Extract<'raw', keyof ToolsReadRuntime<P>['content']>>().toEqualTypeOf<never>()
})
