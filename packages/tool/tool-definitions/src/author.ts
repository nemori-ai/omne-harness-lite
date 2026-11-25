import { textBody } from './returns.ts'
import type { Modality } from '@omne-harness/modality'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import {
  bindingKinds,
  environmentNeedAdoption,
  type BindingKind,
  type FacilityKey,
} from '@omne-harness/execution-environment-contract'
import {
  type CommandCallEncoding,
  type CommandTable,
  type ToolCommandRelease,
  type ToolGate,
  type ToolProgramAccess,
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
} from '@omne-harness/tool-contract/provider'
import {
  adoption,
  contract,
  parameterCodec,
  tree,
  type Arguments,
  type Command,
} from './protocol.ts'
import { commandOperation, commandReturns, programAccess, type Answer } from './program-side.ts'

export const ENCODING: CommandCallEncoding = 'wrapped'

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

export type AuthorOptions<E> = Readonly<{
  settings?: ToolSettingsDeclaration | null
  encoding?: CommandCallEncoding
  /** The isolation the place of a call must assert, by name, and the layers it may be on. */
  isolation?: readonly string[]
  layers?: readonly BindingKind[]
  /** What `help` answers instead of the usage of the commands. */
  help?: (args: Arguments, environment: E, execution: ToolExecutionContext) => Promise<string>
  gates?: CommandGates
  /** The commands whose result is blocks, by name; every other command returns text. */
  structured?: Readonly<Record<string, StructuredCommand<E>>>
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

type TableEntry<E> = {
  summary: string
  operation: ToolOperation<E, ToolMessageContentBlock>
  release?: ToolCommandRelease
  program?: ToolProgramAccess
  modalities?: readonly Modality[]
  readOnly?: boolean
}

const menuEntry = (
  command: Command,
  declared: CommandTable['commands'][number]['returns'],
): CommandTable['commands'][number] => ({
  name: command.name,
  summary: command.summary,
  parameters: { kind: 'declared', value: contract(command) },
  returns: declared,
  ...(command.background === undefined ? {} : { background: command.background }),
  ...(command.program === undefined ? {} : { program: programAccess(command.program) }),
})

function tableEntry<E>(
  command: Command,
  operation: ToolOperation<E, ToolMessageContentBlock>,
  gates: CommandGates | undefined,
  modalities: readonly Modality[] | undefined,
): TableEntry<E> {
  return {
    summary: command.summary,
    operation,
    ...(command.background === undefined ? {} : { background: command.background }),
    ...(command.program === undefined ? {} : { program: programAccess(command.program) }),
    ...(gates === undefined ? {} : { release: releaseOf(gates, command.name) }),
    ...(modalities === undefined ? {} : { modalities }),
    ...(command.readOnly === true ? { readOnly: true } : {}),
  }
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
  ) => Promise<string | Answer>,
  options: AuthorOptions<E> = {},
): ToolImplementation<E, ToolMessageContentBlock> {
  const { settings = null, gates, structured = {}, encoding = ENCODING, isolation = [] } = options
  const layers = options.layers ?? bindingKinds
  const codec = createToolMessageResultCodec(maximum)
  const menu: CommandTable = {
    name,
    encoding,
    guide: rules,
    commands: commands.map(command =>
      menuEntry(
        command,
        structured[command.name] === undefined
          ? commandReturns(`${name}.${command.name}`, adoption, command.program)
          : blocksReturns(codec),
      ),
    ),
  }
  const table: Record<string, TableEntry<E>> = {}
  for (const command of commands) {
    const special = structured[command.name]
    const operation =
      special !== undefined
        ? structuredOperation(command, special, codec)
        : commandOperation<Arguments, E>({
            entry: `${name}.${command.name}`,
            parameters: contract(command),
            arguments: parameterCodec(command),
            text: adoption,
            side: command.program,
            maximum,
            async run(args, environment, execution) {
              if (command.name === 'help')
                return {
                  text: (await options.help?.(args, environment, execution)) ?? help(menu, args),
                }
              const given = await execute(command.name, args, environment, execution)
              return typeof given === 'string' ? { text: given } : given
            },
          })
    if ('failure' in operation) throw new TypeError(JSON.stringify(operation.failure))
    table[command.name] = tableEntry(command, operation.ok, gates, special?.modalities)
  }
  const result = defineCommandTool({
    implementation: {
      description: purpose,
      backgroundAllowed: commands.some(command => command.background !== undefined),
      declarations: {
        adoption,
        environment: {
          adoption: environmentNeedAdoption,
          value: tree({ facilities, isolation, layers }),
        },
        attachments: [],
        inputModalities: ['text'],
        outputModalities: ['text'],
        settings,
      },
    },
    encoding,
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
