import { textBody, textReturns } from './returns.ts'
import type { Modality } from '@omne-harness/modality'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import {
  bindingKinds,
  environmentNeedAdoption,
  type FacilityKey,
} from '@omne-harness/execution-environment-contract'
import {
  type CommandCallEncoding,
  type CommandTable,
  type ToolCommandRelease,
  type ToolGate,
  type ToolResult,
  type ToolSettingsDeclaration,
} from '@omne-harness/tool-contract'
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

export const ENCODING: CommandCallEncoding = 'wrapped'
const returns = textReturns(adoption)

export type CommandGates = Readonly<{
  gates: readonly ToolGate[]
  of: Readonly<Record<string, string | null>>
}>

function releaseOf(gates: CommandGates, command: string): ToolCommandRelease {
  const gate = gates.of[command]
  if (gate === undefined) throw new TypeError(`The command ${command} names no gate`)
  return { gate }
}

/** A command whose result is blocks, not text: what it adds to the tool's modalities, and its body. */
export type StructuredCommand<E> = Readonly<{
  modalities: readonly Modality[]
  execute: (
    args: Arguments,
    environment: E,
    execution: ToolExecutionContext,
  ) => Promise<ToolResult<ToolMessageContentBlock>>
}>

type ResultCodec = ReturnType<typeof createToolMessageResultCodec>

const blocksReturns = (codec: ResultCodec) =>
  ({
    kind: 'structured',
    value: { kind: 'tool-result', contract: codec.adoption },
    program: { kind: 'none' },
    body: textBody,
    offloading: { inline: { kind: 'system' }, retention: { kind: 'system' } },
  }) as const

function structuredOperation<E>(command: Command, body: StructuredCommand<E>, codec: ResultCodec) {
  return defineToolOperation({
    parameters: { kind: 'declared', value: contract(command) },
    returns: blocksReturns(codec),
    author: {
      kind: 'structured',
      parameters: parameterCodec(command),
      waits: [],
      codec,
      output: {
        adoption,
        check: ({ value }: { value: unknown }) => {
          const encoded = codec.encode(value)
          return 'failure' in encoded ? encoded : codec.decode(encoded.ok)
        },
      },
      program: { kind: 'none' },
      executor: { execute: body.execute },
    },
  })
}

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
  settings: ToolSettingsDeclaration | null = null,
  gates?: CommandGates,
  structured: Readonly<Record<string, StructuredCommand<E>>> = {},
): ToolImplementation<E, ToolMessageContentBlock> {
  const codec = createToolMessageResultCodec(maximum)
  const menu: CommandTable = {
    name,
    encoding: ENCODING,
    guide: rules,
    commands: commands.map(command => ({
      name: command.name,
      summary: command.summary,
      parameters: { kind: 'declared', value: contract(command) },
      returns: structured[command.name] === undefined ? returns : blocksReturns(codec),
      ...(command.background === undefined ? {} : { background: command.background }),
    })),
  }
  const table: Record<
    string,
    {
      summary: string
      operation: ToolOperation<E, ToolMessageContentBlock>
      release?: ToolCommandRelease
      modalities?: readonly Modality[]
    }
  > = {}
  for (const command of commands) {
    const special = structured[command.name]
    const operation =
      special !== undefined
        ? structuredOperation(command, special, codec)
        : defineToolOperation<
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
    table[command.name] = {
      summary: command.summary,
      operation: operation.ok,
      ...(command.background === undefined ? {} : { background: command.background }),
      ...(gates === undefined ? {} : { release: releaseOf(gates, command.name) }),
      ...(special === undefined ? {} : { modalities: special.modalities }),
    }
  }
  const result = defineCommandTool({
    implementation: {
      description: purpose,
      backgroundAllowed: commands.some(command => command.background !== undefined),
      declarations: {
        adoption,
        environment: {
          adoption: environmentNeedAdoption,
          value: tree({ facilities, isolation: [], layers: bindingKinds }),
        },
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings,
      },
    },
    encoding: ENCODING,
    guide: rules,
    ...(gates === undefined ? {} : { gates: gates.gates }),
    commands: table,
  })
  if ('failure' in result) throw new TypeError(JSON.stringify(result.failure))
  return result.ok
}
function help(menu: CommandTable, args: Arguments): string {
  const name = args.optionalText('name')
  const done = `done ${menu.name} help${name === undefined ? '' : ` ${name}`}`
  return `${done}\n${commandGuide(menu, name)}`
}
