import type { Access } from '@omne-harness/tool-contract'
import { judgeContentBlock } from '@omne-harness/content-block'
import { formatKeyValue, formatSuccess, formatUsage } from '@omne-harness/unix-format'
import type { ToolsOptions, ToolsReadRuntime } from './tools.ts'
import { callableRead, protocol, type ReadArguments } from './tools-protocol.ts'
import {
  bounded,
  budgetFailure,
  failureResult,
  fits,
  message,
  type MessageResult,
} from './tools-results.ts'

export function createToolsBodyReader<P>(runtime: ToolsReadRuntime<P>, options: ToolsOptions) {
  const refs = protocol(options.arguments)
  const error = (failure: Parameters<typeof failureResult>[0]) =>
    bounded(failureResult(failure), options)
  return async (
    input: ReadArguments,
    access: Access<P>,
    after: string | null,
  ): Promise<MessageResult> => {
    const source = refs.readBody(input.reference)
    if ('failure' in source) return error(source.failure)
    let maxBytes = options.contentPageBytes
    for (;;) {
      const response = await runtime.body.read({ ...access, ...source.ok, after, maxBytes })
      if ('failure' in response) return error(response.failure)
      const page = response.ok
      if (
        page.result !== source.ok.result ||
        page.bodyId !== source.ok.bodyId ||
        Buffer.byteLength(page.text) > maxBytes
      )
        return error(budgetFailure())
      const next = page.next === null ? null : refs.cursor('body', input.reference, page.next)
      if (next !== null && !callableRead({ ...input, after: next }, options.arguments))
        return error(budgetFailure())
      const block = judgeContentBlock({
        kind: 'text',
        id: 'Tools.body',
        visibility: { toModel: true, toHuman: true },
        text: page.text,
      })
      if ('rejected' in block || block.ok.kind !== 'text') return error(budgetFailure())
      const value = message(
        [
          formatSuccess('body read'),
          formatKeyValue({
            reading: 'success',
            reference: input.reference,
            position: page.position,
            bodyBytes: page.bodyBytes,
            expiresAt: page.expiresAt,
            encoding: 'utf-8',
            next: next ?? 'null',
          }),
          next === null
            ? 'Body traversal ended.'
            : formatUsage('Tools', 'read_result', JSON.stringify({ ...input, after: next })),
        ].join('\n'),
        [block.ok],
      )
      if (fits(value, options)) return value
      const first = page.text.codePointAt(0)
      const minimum = first === undefined ? 1 : Buffer.byteLength(String.fromCodePoint(first))
      if (maxBytes <= minimum) return error(budgetFailure())
      maxBytes = Math.max(minimum, Math.floor(maxBytes / 2))
    }
  }
}
