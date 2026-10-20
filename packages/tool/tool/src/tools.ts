import type { JsonLimits } from '@omne-harness/json-text'
import {
  type Access,
  type InvocationAccess,
  type Reply,
  type ToolAuthorRegistration,
  type ToolMessageContentBlock,
  type ToolResult,
  type ToolResultVersion,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import { fits, failureResult, budgetFailure } from './tools-results.ts'
import { createToolsPresenter } from './tools-present.ts'
import { createToolsAuthor } from './tools-commands.ts'
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
export type Tools<P> = Readonly<{
  author: ToolAuthorRegistration<Access<P>, ToolMessageContentBlock>
  present(input: ToolsAccess<P>): Promise<ToolResult<ToolMessageContentBlock>>
  readReply(input: ToolsAccess<P>): Reply<ToolResult<ToolMessageContentBlock>>
}>

export function createTools<P>(runtime: ToolsReadRuntime<P>, input: ToolsOptions): Tools<P> {
  const options = { ...input, arguments: { ...input.arguments } }
  for (const value of [options.resultPageBytes, options.replyMaxBytes, options.contentPageBytes]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid Tools byte budget')
  }
  const maxReads = 2 * Math.ceil(options.replyMaxBytes / options.resultPageBytes) + 1
  if (!Number.isSafeInteger(maxReads)) throw new TypeError('Invalid Tools reply read limit')
  if (!fits(failureResult(budgetFailure()), options))
    throw new TypeError('Tools fixed error cannot fit one page')
  const presenter = createToolsPresenter(runtime, options)
  return {
    author: createToolsAuthor(options, presenter.read),
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
