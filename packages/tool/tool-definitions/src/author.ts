import { fail, succeed } from '@omne-harness/operation-result'
import {
  bindingKinds,
  environmentNeedAdoption,
  type FacilityKey,
} from '@omne-harness/execution-environment-contract'
import {
  commandMenu,
  type CommandCallEncoding,
  type CommandTable,
} from '@omne-harness/tool-contract'
import {
  commandExample,
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

/** How the model calls Files and Shell through their one declaration (D-94, R2-D396). */
export const ENCODING: CommandCallEncoding = 'wrapped'
const returns = { kind: 'ordinary', program: { kind: 'none' } } as const

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
  const menu: CommandTable = {
    name,
    encoding: ENCODING,
    commands: commands.map(command => ({
      name: command.name,
      summary: command.summary,
      parameters: { kind: 'declared', value: contract(command) },
      returns,
    })),
  }
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
      returns,
      author: {
        kind: 'ordinary',
        parameters: parameterCodec(command, commandExample(menu, command.name)),
        waits: [],
        executor: {
          execute: async (args: Arguments, environment: E, execution: ToolExecutionContext) =>
            bounded(
              command.name === 'help'
                ? help(menu, commands, args, rules)
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
      // The command menu joins the description where the tool is declared to a model.
      description: purpose,
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
    encoding: ENCODING,
    commands: table,
  })
  if ('failure' in result) throw new TypeError(JSON.stringify(result.failure))
  return result.ok
}
/**
 * Help answers one command in full, or the menu and the rules. The codec already checked that a
 * given name is a command, so an unknown name never reaches here.
 */
function help(
  menu: CommandTable,
  commands: readonly Command[],
  args: Arguments,
  rules: string,
): string {
  const selected = commands.find(item => item.name === args.optionalText('name'))
  if (selected === undefined) return [`done ${menu.name} help`, commandMenu(menu), rules].join('\n')
  return [
    `done ${menu.name} help ${selected.name}`,
    `Usage: ${commandExample(menu, selected.name)}`,
    selected.summary,
    `JSON Schema: ${schemaText(selected)}`,
    ...selected.fields.map(field => `${field.name}: ${field.description}`),
    rules,
  ].join('\n')
}
