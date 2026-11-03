import { fail, succeed } from '@omne-harness/operation-result'
import {
  bindingKinds,
  environmentNeedAdoption,
  type FacilityKey,
} from '@omne-harness/execution-environment-contract'
import {
  defineCommandTool,
  defineToolOperation,
  type ToolExecutionContext,
  type ToolImplementation,
  type ToolMessageContentBlock,
  type ToolOperation,
  type ToolOperationParameters,
} from '@omne-harness/tool-contract/provider'
import {
  adoption,
  contract,
  parameterCodec,
  schemaText,
  tree,
  type Arguments,
  type Command,
} from './protocol.ts'
import { bounded } from './text.ts'

export function createAuthor<E>(
  name: string,
  purpose: string,
  commands: readonly Command[],
  facilities: readonly FacilityKey[],
  maximum: number,
  rules: string,
  execute: (
    command: string,
    args: Arguments,
    environment: E,
    execution: ToolExecutionContext,
  ) => Promise<string>,
): ToolImplementation<E, ToolMessageContentBlock> {
  const table: Record<
    string,
    { summary: string; operation: ToolOperation<E, ToolMessageContentBlock> }
  > = {}
  for (const command of commands) {
    const operation = defineToolOperation<
      Arguments,
      string,
      E,
      ToolMessageContentBlock,
      Extract<ToolOperationParameters, { kind: 'declared' }>
    >({
      parameters: { kind: 'declared', value: contract(command) },
      returns: { kind: 'ordinary', program: { kind: 'none' } },
      author: {
        kind: 'ordinary',
        parameters: parameterCodec(command),
        waits: [],
        executor: {
          execute: async (args: Arguments, environment: E, execution: ToolExecutionContext) =>
            bounded(
              command.name === 'help'
                ? help(name, commands, args, rules)
                : await execute(command.name, args, environment, execution),
              maximum,
            ),
        },
        codec: {
          adoption,
          encode: (value: unknown) =>
            typeof value === 'string'
              ? succeed(new TextEncoder().encode(value))
              : fail({ reason: 'text-required' }),
          decode: bytes => {
            try {
              return succeed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
            } catch {
              return fail({ reason: 'invalid-utf8' })
            }
          },
        },
        output: {
          adoption,
          check: ({ value }: { value: unknown }) =>
            typeof value === 'string' && new TextEncoder().encode(value).byteLength <= maximum
              ? succeed(value)
              : fail({ reason: 'bounded-text-required' }),
        },
        renderer: { render: (value: string) => succeed(value) },
        program: { kind: 'none' },
      },
    })
    if ('failure' in operation) throw new TypeError(JSON.stringify(operation.failure))
    table[command.name] = { summary: command.summary, operation: operation.ok }
  }
  const result = defineCommandTool({
    implementation: {
      description: [
        purpose,
        '',
        ...commands.map(command => `${command.name}: ${command.summary}`),
      ].join('\n'),
      backgroundAllowed: false,
      declarations: {
        adoption,
        environment: {
          adoption: environmentNeedAdoption,
          value: tree({ facilities, isolation: [], layers: bindingKinds }),
        },
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings: null,
      },
    },
    commands: table,
  })
  if ('failure' in result) throw new TypeError(JSON.stringify(result.failure))
  return result.ok
}
function help(name: string, commands: readonly Command[], args: Arguments, rules: string): string {
  const command = args.optionalText('command')
  const selected = commands.filter(item => command === undefined || item.name === command)
  if (selected.length === 0) return 'rejected reason=unknown-command'
  return [
    `done ${name} help`,
    ...commands.map(item => `${item.name}  ${item.summary}`),
    ...selected.map(item =>
      [
        `Usage: ${name} ${item.name} <JSON object>`,
        item.summary,
        `JSON Schema: ${schemaText(item)}`,
        ...item.fields.map(field => `${field.name}: ${field.description}`),
      ].join('\n'),
    ),
    rules,
  ].join('\n')
}
