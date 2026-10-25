import { type Access } from '@omne-harness/tool-contract'
import {
  defineCommandTool,
  defineToolOperation,
  type ToolOperation,
} from '@omne-harness/tool-contract/provider'
import { formatCommandList, formatSuccess, formatUsage } from '@omne-harness/unix-format'
import type { Tools, ToolsOptions } from './tools.ts'
import {
  commandDescriptions,
  parameterCodecs,
  parameterContract,
  toolsAdoption,
  type ReadArguments,
  type HelpArguments,
} from './tools-protocol.ts'
import {
  bounded,
  checkMessage,
  failureResult,
  message,
  outputCodec,
  section,
  type MessageResult,
} from './tools-results.ts'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'

export function createToolsAuthor<P>(
  options: ToolsOptions,
  read: (argumentsValue: ReadArguments, access: Access<P>) => Promise<MessageResult>,
): Tools<P>['implementation'] {
  const codecs = parameterCodecs(options.arguments)
  const finish = (value: MessageResult) => bounded(value, options)
  const error = (failure: Parameters<typeof failureResult>[0]) => finish(failureResult(failure))
  const codec = outputCodec(options.replyMaxBytes)
  const commands: Record<
    string,
    Readonly<{ summary: string; operation: ToolOperation<Access<P>, ToolMessageContentBlock> }>
  > = {}
  for (const descriptor of commandDescriptions) {
    const common = {
      kind: 'structured',
      waits: [],
      codec,
      output: {
        adoption: toolsAdoption,
        check: ({ value }: Readonly<{ value: unknown }>) => checkMessage(value),
      },
      program: { kind: 'none' },
    } as const
    const operation =
      descriptor.name === 'help'
        ? defineToolOperation({
            parameters: { kind: 'declared', value: parameterContract(descriptor) },
            returns: { kind: 'structured', program: { kind: 'none' } },
            author: {
              ...common,
              parameters: codecs.help,
              executor: {
                execute: async ({ command }: HelpArguments, _access: Access<P>) => {
                  const found = commandDescriptions.find(item => item.name === command)
                  if (command !== null && found === undefined)
                    return error({ kind: 'invalid', field: 'command', reason: 'unknown-command' })
                  const selected = found === undefined ? commandDescriptions : [found]
                  return finish(
                    message(
                      [
                        formatSuccess('Tools help'),
                        section(
                          'Commands',
                          formatCommandList(
                            commandDescriptions.map(item => [
                              item.name,
                              item.synopsis,
                              item.summary,
                            ]),
                          ),
                        ),
                        ...selected.map(item =>
                          [
                            section(item.name, item.summary),
                            formatUsage('Tools', item.name, item.synopsis),
                            section('JSON Schema', item.schema),
                            ...item.fields.map(field => `${field.name}: ${field.description}`),
                          ].join('\n'),
                        ),
                        section(
                          'Reading rules',
                          'Copy reference and next exactly. Start with after=null. Continue with the previous next. next=null means the selected traversal ended. References grant no access. Each read checks current qualification. Result content end does not mean attachment or offloaded original bytes were read. Errors contain no source content or next. The source terminal can be failed while reading succeeds. A completed Tools invocation means the command answered, even when reading failed. Attachment bytes are base64. Decode the complete bytes according to mediaType. Raw output is not a selector.',
                        ),
                      ].join('\n'),
                    ),
                  )
                },
              },
            },
          })
        : defineToolOperation({
            parameters: { kind: 'declared', value: parameterContract(descriptor) },
            returns: { kind: 'structured', program: { kind: 'none' } },
            author: { ...common, parameters: codecs.read, executor: { execute: read } },
          })
    if ('failure' in operation) throw new TypeError('Invalid Tools operation')
    commands[descriptor.name] = { summary: descriptor.summary, operation: operation.ok }
  }
  // Stage one implements only help and read_result, not the complete Tools meta-tool.
  // The complete implementation must live in a separate source package.
  // Migrate this definition and its supporting implementation there when that version is delivered.
  const registration = defineCommandTool({
    implementation: {
      description: 'Read fixed tool results and attachment bytes. Use help for parameters.',
      backgroundAllowed: false,
      declarations: {
        adoption: toolsAdoption,
        environment: null,
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text', 'image', 'voice', 'video'],
        settings: null,
      },
    },
    commands,
  })
  if ('failure' in registration) throw new TypeError('Invalid Tools registration')
  return registration.ok
}
