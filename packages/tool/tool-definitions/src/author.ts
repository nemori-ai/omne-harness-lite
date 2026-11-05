import { fail, succeed } from '@omne-harness/operation-result'
import {
  bindingKinds,
  environmentNeedAdoption,
  type FacilityKey,
} from '@omne-harness/execution-environment-contract'
import { type CommandCallEncoding, type CommandTable } from '@omne-harness/tool-contract'
import {
  commandGuide,
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
    guide: rules,
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
        parameters: parameterCodec(command),
        waits: [],
        executor: {
          execute: async (args: Arguments, environment: E, execution: ToolExecutionContext) =>
            bounded(
              command.name === 'help'
                ? help(menu, args)
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
    guide: rules,
    commands: table,
  })
  if ('failure' in result) throw new TypeError(JSON.stringify(result.failure))
  return result.ok
}
/**
 * Help answers the guide of one command, or of the whole tool: the same text a wrong call reads.
 * The codec already checked that a given name is a command, so an unknown name never reaches here.
 */
function help(menu: CommandTable, args: Arguments): string {
  const name = args.optionalText('name')
  const done = `done ${menu.name} help${name === undefined ? '' : ` ${name}`}`
  return `${done}\n${commandGuide(menu, name)}`
}
