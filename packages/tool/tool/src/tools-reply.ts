import { fail, succeed } from '@omne-harness/operation-result'
import type { ResultPage } from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import type { ToolsAccess, ToolsOptions, ToolsReadRuntime } from './tools.ts'
import { budgetFailure, jsonBytes, type MessageResult } from './tools-results.ts'

function metadata(page: ResultPage<ToolMessageContentBlock>): string {
  const { value, next: _next, ...facts } = page
  return JSON.stringify({ ...facts, value: { ...value, content: [] } })
}
export function replyReader<P>(
  runtime: ToolsReadRuntime<P>,
  options: ToolsOptions,
  maxReads: number,
) {
  return async (input: ToolsAccess<P>) => {
    const fixed = {
      principal: input.principal,
      tenant: input.tenant,
      reference: input.reference,
      result: input.result,
    }
    let after: string | null = null
    let first: ResultPage<ToolMessageContentBlock> | null = null
    let signature = ''
    let bytes = 0
    const content: ToolMessageContentBlock[] = []
    const cursors = new Set<string>()
    for (let count = 0; count < maxReads; count += 1) {
      const response = await runtime.queries.readResult({ ...fixed, after })
      if ('failure' in response) return response
      const page = response.ok
      if (
        page.result !== fixed.result ||
        jsonBytes(page.value) > options.replyMaxBytes ||
        (page.next !== null && page.value.content.length === 0)
      )
        return fail(budgetFailure())
      if (first === null) {
        first = structuredClone(page)
        signature = metadata(page)
        bytes = jsonBytes({ ...page.value, content: [] })
      } else if (metadata(page) !== signature) return fail(budgetFailure())
      for (const block of page.value.content) {
        bytes += jsonBytes(block) + (content.length === 0 ? 0 : 1)
        if (bytes > options.replyMaxBytes) return fail(budgetFailure())
        content.push(structuredClone(block))
      }
      if (page.next === null) {
        const result: MessageResult = { ...first.value, content }
        return succeed(result)
      }
      if (cursors.has(page.next)) return fail(budgetFailure())
      cursors.add(page.next)
      after = page.next
    }
    return fail(budgetFailure())
  }
}
