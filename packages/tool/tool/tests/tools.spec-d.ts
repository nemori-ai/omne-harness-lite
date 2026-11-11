import { expectTypeOf, it } from 'vitest'
import {
  createToolResultReader,
  type ToolResultReader,
  type ToolsAccess,
  type ToolsOptions,
  type ToolsReadRuntime,
} from '@omne-harness/tool'
import type {
  InvocationAccess,
  Reply,
  ToolResult,
  ToolResultVersion,
  ToolRuntime,
} from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'

it('createToolResultReader consumes only the public result and content read ports', () => {
  type P = { subject: string }
  expectTypeOf(createToolResultReader<P>).parameters.toEqualTypeOf<
    [ToolsReadRuntime<P>, ToolsOptions]
  >()
  expectTypeOf(createToolResultReader<P>).returns.toEqualTypeOf<ToolResultReader<P>>()
  expectTypeOf<ToolsAccess<P>>().toEqualTypeOf<
    InvocationAccess<P> & Readonly<{ result: ToolResultVersion }>
  >()
  expectTypeOf<ToolsReadRuntime<P>>().toEqualTypeOf<
    Readonly<{
      queries: Pick<ToolRuntime<P, ToolMessageContentBlock>['queries'], 'readResult'>
      content: Pick<ToolRuntime<P, ToolMessageContentBlock>['content'], 'read'>
      body: ToolRuntime<P, ToolMessageContentBlock>['body']
    }>
  >()
  expectTypeOf<ToolResultReader<P>>().not.toHaveProperty('implementation')
  expectTypeOf<ToolResultReader<P>>().not.toHaveProperty('definition')
  expectTypeOf<ToolResultReader<P>['present']>().toEqualTypeOf<
    (input: ToolsAccess<P>) => Promise<ToolResult<ToolMessageContentBlock>>
  >()
  expectTypeOf<ToolResultReader<P>['readReply']>().toEqualTypeOf<
    (input: ToolsAccess<P>) => Reply<ToolResult<ToolMessageContentBlock>>
  >()
  expectTypeOf<Extract<'invoke', keyof ToolsReadRuntime<P>>>().toEqualTypeOf<never>()
  expectTypeOf<Extract<'raw', keyof ToolsReadRuntime<P>['content']>>().toEqualTypeOf<never>()
})
