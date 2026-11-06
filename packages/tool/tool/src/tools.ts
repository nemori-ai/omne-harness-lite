import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  type Access,
  type InvocationAccess,
  type Reply,
  type ToolResult,
  type ToolResultVersion,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import { type ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { fits, failureResult, budgetFailure } from './tools-results.ts'
import { createToolsPresenter } from './tools-present.ts'
import type { ReadArguments } from './tools-protocol.ts'
import { replyReader } from './tools-reply.ts'

export type ToolsAccess<P> = InvocationAccess<P> & Readonly<{ result: ToolResultVersion }>
export type ToolsOptions = Readonly<{
  arguments: JsonLimits
  resultPageBytes: number
  replyMaxBytes: number
  contentPageBytes: number
}>
export type ToolsReadRuntime<P> = Readonly<{
  queries: Pick<ToolRuntime<P, ToolMessageContentBlock>['queries'], 'readResult'>
  content: Pick<ToolRuntime<P, ToolMessageContentBlock>['content'], 'read'>
}>
/** Fixed result/attachment reading and presentation, independent of any tool author. */
export type ToolResultReader<P> = Readonly<{
  present(input: ToolsAccess<P>): Promise<ToolResult<ToolMessageContentBlock>>
  readReply(input: ToolsAccess<P>): Reply<ToolResult<ToolMessageContentBlock>>
  read(
    input: Access<P> & Readonly<{ arguments: ReadArguments }>,
  ): Promise<ToolResult<ToolMessageContentBlock>>
}>

export function createToolResultReader<P>(
  runtime: ToolsReadRuntime<P>,
  input: ToolsOptions,
): ToolResultReader<P> {
  const options = { ...input, arguments: { ...input.arguments } }
  readJsonText('null', options.arguments)
  for (const value of [options.resultPageBytes, options.replyMaxBytes, options.contentPageBytes]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid Tools byte budget')
  }
  const maxReads = 2 * Math.ceil(options.replyMaxBytes / options.resultPageBytes) + 1
  if (!Number.isSafeInteger(maxReads)) throw new TypeError('Invalid Tools reply read limit')
  if (!fits(failureResult(budgetFailure()), options))
    throw new TypeError('Tools fixed error cannot fit one page')
  const presenter = createToolsPresenter(runtime, options)
  return {
    read: input => presenter.read(input.arguments, input),
    present: input =>
      presenter.resultPage(
        {
          principal: input.principal,
          tenant: input.tenant,
          reference: input.reference,
          result: input.result,
        },
        null,
      ),
    readReply: replyReader(runtime, options, maxReads),
  }
}
