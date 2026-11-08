import type { ToolRenderedResult, ToolBodyDeclaration } from '@omne-harness/tool-contract'
import { tree } from '../tool-host/support.ts'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import {
  defineFunctionTool,
  defineToolOperation,
  describedAdoption,
  type ToolImplementationModule,
  type ToolExecutor,
  type ToolMessageContentBlock,
  type ToolOperationParameters,
  type OutputCodec,
} from '@omne-harness/tool-contract/provider'

export const LARGE_BODY = `W3-BEGIN\n${'x'.repeat(5 * 1024 * 1024)}\nW3-END\n`
export const LARGE_TOOL = 'W3LargeBody'

const adoption = describedAdoption({ owner: 'w3-release-test', name: LARGE_TOOL, revision: '1' })
const codec = createToolMessageResultCodec(8 * 1024 * 1024)

export function createLargeBodyModule(
  executor: ToolExecutor<null, ToolRenderedResult<ToolMessageContentBlock>, unknown>,
  output: OutputCodec<ToolRenderedResult<ToolMessageContentBlock>> = codec,
  body: ToolBodyDeclaration = { kind: 'text', codec: adoption },
  maxInlineUtf8Bytes?: number,
): ToolImplementationModule<unknown, ToolMessageContentBlock> {
  return {
    executor: adoption,
    createAuthor: () => {
      const operation = defineToolOperation<
        null,
        ToolRenderedResult<ToolMessageContentBlock>,
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
          value: { kind: 'tool-result', contract: output.adoption },
          program: { kind: 'none' },
          body,
          offloading: {
            inline:
              maxInlineUtf8Bytes === undefined
                ? { kind: 'system' }
                : { kind: 'bounded', maxInlineUtf8Bytes },
            retention: { kind: 'system' },
          },
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
          codec: output,
          output: {
            adoption,
            check: ({ value }) => {
              const bytes = output.encode(value)
              return 'failure' in bytes ? bytes : output.decode(bytes.ok)
            },
          },
          program: { kind: 'none' },
          executor,
        },
      })
      if ('failure' in operation) return operation
      return defineFunctionTool({
        implementation: {
          description: 'Ephemeral body lifecycle test corpus.',
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
}

export const largeBodyModule = createLargeBodyModule({
  execute: async () => {
    const result = codec.decode(
      Buffer.from(
        JSON.stringify({
          content: [
            {
              kind: 'text',
              id: 'corpus',
              text: LARGE_BODY,
              visibility: { toModel: true, toHuman: true },
            },
          ],
          original: { kind: 'none' },
          data: { kind: 'none' },
          attachments: [],
        }),
      ),
    )
    if ('failure' in result) throw new Error(result.failure.reason)
    return result.ok
  },
})
