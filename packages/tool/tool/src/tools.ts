import type { JsonLimits } from '@omne-harness/json-text'
import {
  type Access,
  type InvocationAccess,
  type Reply,
  type ToolDefinition,
  type ToolResult,
  type ToolResultVersion,
  type ToolRuntime,
} from '@omne-harness/tool-contract'
import {
  deriveDefinition,
  type ToolImplementation,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { fits, failureResult, budgetFailure } from './tools-results.ts'
import { createToolsPresenter } from './tools-present.ts'
import { createToolsAuthor } from './tools-commands.ts'
import { toolsAdoption } from './tools-protocol.ts'
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
/**
 * The Tools meta tool. `implementation` is its implementation side, to register through the
 * binding provider. `definition` is derived from the official governance of the meta tool: it is
 * resident, not programmable and has no required capability (RFC-0012 meta entry).
 */
export type Tools<P> = Readonly<{
  implementation: ToolImplementation<Access<P>, ToolMessageContentBlock>
  definition: ToolDefinition
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
  const implementation = createToolsAuthor(options, presenter.read)
  return {
    implementation,
    definition: deriveDefinition(
      {
        asset: { name: 'Tools', adoption: toolsAdoption },
        requiredCapabilities: [],
        programmable: false,
      },
      implementation.facts,
    ),
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
