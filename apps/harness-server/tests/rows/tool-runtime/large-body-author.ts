import type { ToolResult } from '@omne-harness/tool-contract'
import { tree } from '../tool-host/support.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import {
  defineFunctionTool,
  defineToolOperation,
  describedAdoption,
  type ToolImplementationModule,
  type ToolMessageContentBlock,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'

export const LARGE_BODY = `W3-BEGIN\n${'x'.repeat(5 * 1024 * 1024)}\nW3-END\n`
export const LARGE_TOOL = 'W3LargeBody'

const adoption = describedAdoption({ owner: 'w3-release-test', name: LARGE_TOOL, revision: '1' })
const codec = createToolMessageResultCodec(8 * 1024 * 1024)

export const largeBodyModule: ToolImplementationModule<unknown, ToolMessageContentBlock> = {
  executor: adoption,
  createAuthor: () => {
    const operation = defineToolOperation<
      null,
      ToolResult<ToolMessageContentBlock>,
      unknown,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: {
        kind: 'declared',
        value: {
          vocabulary: adoption,
          schema: tree({ type: 'object', additionalProperties: false, properties: {} }),
          descriptions: [],
        },
      },
      returns: {
        kind: 'structured',
        value: { kind: 'tool-result', contract: codec.adoption },
        program: { kind: 'none' },
        body: { kind: 'text', codec: adoption },
        offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
      },
      author: {
        kind: 'structured',
        parameters: {
          adoption,
          parse: input =>
            input.complete && input.effective === '{}'
              ? succeed(null)
              : fail({ kind: 'invalid', reason: 'empty-arguments-required' }),
        },
        waits: [],
        codec,
        output: {
          adoption,
          check: ({ value }) => {
            const bytes = codec.encode(value)
            return 'failure' in bytes ? bytes : codec.decode(bytes.ok)
          },
        },
        program: { kind: 'none' },
        executor: {
          execute: async () => {
            const result = codec.decode(
              Buffer.from(
                JSON.stringify({
                  content: [
                    {
                      kind: 'text' as const,
                      id: 'corpus',
                      text: LARGE_BODY,
                      visibility: { toModel: true, toHuman: true },
                    },
                  ],
                  original: { kind: 'none' as const },
                  data: { kind: 'none' as const },
                  attachments: [],
                }),
              ),
            )
            if ('failure' in result) throw new Error(result.failure.reason)
            return result.ok
          },
        },
      },
    })
    if ('failure' in operation) return operation
    return defineFunctionTool({
      implementation: {
        description: 'Ephemeral five MiB test corpus.',
        backgroundAllowed: false,
        declarations: {
          adoption,
          environment: null,
          attachments: [],
          inputModalities: ['text'],
          outputModalities: ['text'],
          settings: null,
        },
      },
      operation: operation.ok,
    })
  },
}
