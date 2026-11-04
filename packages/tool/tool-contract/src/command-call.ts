// How a model calls a multi-command tool through its one declaration slot (D-94, R2-D393, R2-D396).
// A multi-command tool is one tool to the model. The call names the command inside the arguments;
// the encoding is a closed set of strategies, and each tool definition names the one it uses.
import {
  readJsonText,
  writeJsonText,
  type JsonEntry,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolArguments, ToolCommandDeclaration, ToolDefinition } from './definitions.ts'

/**
 * The encodings of one call. `wrapped` is `{"command": <name>, "params": {…}}` and `params` may be
 * omitted for `{}`. `flat` is `{"command": <name>, …fields}`; a flat tool declares no field named
 * `command`.
 */
export const COMMAND_CALL_ENCODINGS = ['wrapped', 'flat'] as const
export type CommandCallEncoding = (typeof COMMAND_CALL_ENCODINGS)[number]

export const COMMAND_FIELD = 'command'
export const PARAMS_FIELD = 'params'

type JsonObject = Extract<JsonValue, { kind: 'object' }>
/** One decoded call: the selected command and its parameter object. */
export type CommandCall = Readonly<{ command: string; params: JsonObject }>

/** Why a call text names no command of the tool. Each kind has one fixed English text. */
export type CommandCallRejection =
  | Readonly<{ kind: 'unreadable'; reason: string }>
  | Readonly<{ kind: 'not-object' }>
  | Readonly<{ kind: 'command-missing' }>
  | Readonly<{ kind: 'command-unknown'; command: string }>
  | Readonly<{ kind: 'extra-field'; field: string }>
  | Readonly<{ kind: 'params-not-object' }>
  | Readonly<{ kind: 'command-mismatch'; command: string; admitted: string | null }>

const EMPTY: JsonObject = Object.freeze({ kind: 'object', entries: Object.freeze([]) })
// The budgets of a call text. Admission parsed the same text with the release budgets already.
const CALL_LIMITS: JsonLimits = {
  maxBytes: 4194304,
  maxDepth: 64,
  maxItems: 65536,
  maxMembers: 8192,
  maxStringLength: 4194304,
  maxNumberLength: 64,
}

/**
 * The partial inverse of `encodeCommandCall`: defined on a JSON object whose `command` names one of
 * `commands` and, for `wrapped`, whose other member is at most an object `params`. Everywhere else
 * it answers a rejection, never a guess.
 */
export function decodeCommandCall(
  encoding: CommandCallEncoding,
  commands: readonly string[],
  value: JsonValue,
): Outcome<CommandCall, CommandCallRejection> {
  if (value.kind !== 'object') return fail({ kind: 'not-object' })
  const named = value.entries.find(entry => entry.key === COMMAND_FIELD)
  if (named === undefined || named.value.kind !== 'string') return fail({ kind: 'command-missing' })
  const command = named.value.value
  if (!commands.includes(command)) return fail({ kind: 'command-unknown', command })
  const rest = value.entries.filter(entry => entry.key !== COMMAND_FIELD)
  if (encoding === 'flat') return succeed({ command, params: { kind: 'object', entries: rest } })
  const extra = rest.find(entry => entry.key !== PARAMS_FIELD)
  if (extra !== undefined) return fail({ kind: 'extra-field', field: extra.key })
  const params = rest[0]?.value ?? EMPTY
  return params.kind === 'object'
    ? succeed({ command, params })
    : fail({ kind: 'params-not-object' })
}

/** The call value of one command. `decodeCommandCall` gives back the same call. */
export function encodeCommandCall(encoding: CommandCallEncoding, call: CommandCall): JsonObject {
  const command: JsonEntry = { key: COMMAND_FIELD, value: { kind: 'string', value: call.command } }
  return {
    kind: 'object',
    entries:
      encoding === 'flat'
        ? [command, ...call.params.entries]
        : [command, { key: PARAMS_FIELD, value: call.params }],
  }
}

/** Reads a call text and decodes it; an unreadable text is a rejection, not a thrown error. */
export function decodeCommandCallText(
  encoding: CommandCallEncoding,
  commands: readonly string[],
  text: string,
): Outcome<CommandCall, CommandCallRejection> {
  const read = readJsonText(text, CALL_LIMITS)
  if (read.kind !== 'ok') return fail({ kind: 'unreadable', reason: read.kind })
  return decodeCommandCall(encoding, commands, read.value)
}

/**
 * The arguments the selected command's codec parses. A function tool keeps its arguments. For a
 * multi-command tool the effective text is the whole call: the parameters are cut out of it, and
 * the command in it must be the admitted one. An incomplete block stays as it is, so the codec
 * answers `incomplete`.
 */
export function commandArguments(
  definition: ToolDefinition,
  admitted: string | null,
  args: ToolArguments,
): Outcome<ToolArguments, CommandCallRejection> {
  if (definition.kind === 'function' || !args.complete) return succeed(args)
  const call = decodeCommandCallText(
    definition.encoding,
    definition.commands.map(command => command.name),
    args.effective,
  )
  if ('failure' in call) return call
  if (call.ok.command !== admitted)
    return fail({ kind: 'command-mismatch', command: call.ok.command, admitted })
  return succeed({ ...args, effective: writeJsonText(call.ok.params) })
}

function member(value: JsonValue | undefined, key: string): JsonValue | undefined {
  return value?.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}
function strings(value: JsonValue | undefined): readonly string[] {
  return value?.kind === 'array'
    ? value.items.flatMap(item => (item.kind === 'string' ? [item.value] : []))
    : []
}

/**
 * The one-line signature of a command, derived from its parameter schema: required fields by name,
 * optional fields with `?`, closed choices as `=a|b`. It never repeats types or descriptions. An
 * executor-owned command is `{…}`.
 */
export function commandSignature(parameters: ToolCommandDeclaration['parameters']): string {
  if (parameters.kind === 'executor-owned') return '{…}'
  const schema = parameters.value.schema
  const required = new Set(strings(member(schema, 'required')))
  const properties = member(schema, 'properties')
  const fields =
    properties?.kind === 'object'
      ? properties.entries.map(({ key, value }) => {
          const choices = strings(member(value, 'enum'))
          return `${key}${required.has(key) ? '' : '?'}${choices.length === 0 ? '' : `=${choices.join('|')}`}`
        })
      : []
  return `{${fields.join(', ')}}`
}

/** A call of one command as the model writes it, for usage lines, help and receipts. */
export function commandExample(
  definition: Extract<ToolDefinition, { kind: 'commands' }>,
  command: string,
): string {
  const found = definition.commands.find(item => item.name === command)
  const signature = found === undefined ? '{…}' : commandSignature(found.parameters)
  const fields = signature.slice(1, -1)
  return definition.encoding === 'flat'
    ? `${definition.name} {"command": "${command}"${fields === '' ? '' : `, ${fields}`}}`
    : `${definition.name} {"command": "${command}", "params": ${signature}}`
}

/**
 * The command menu of a multi-command tool: the call form, then one line per command with its
 * signature and summary. The model declaration and `help` without a command use the same menu.
 */
export function commandMenu(definition: Extract<ToolDefinition, { kind: 'commands' }>): string {
  const form =
    definition.encoding === 'flat'
      ? '{"command": <name>, …fields}'
      : '{"command": <name>, "params": {…fields}}'
  return [
    `Call with ${form}. In signatures, ? marks an optional field and a|b lists the allowed values.`,
    ...definition.commands.map(
      command => `${command.name} ${commandSignature(command.parameters)} - ${command.summary}`,
    ),
  ].join('\n')
}

const string = (value: string): JsonValue => ({ kind: 'string', value })
const entry = (key: string, value: JsonValue): JsonEntry => ({ key, value })

/** The arguments schema of the one declaration of a multi-command tool. */
export function commandCallSchema(definition: Extract<ToolDefinition, { kind: 'commands' }>): JsonValue {
  const command = {
    kind: 'object' as const,
    entries: [
      entry('type', string('string')),
      entry('enum', { kind: 'array', items: definition.commands.map(item => string(item.name)) }),
    ],
  }
  const properties: JsonEntry[] = [entry(COMMAND_FIELD, command)]
  if (definition.encoding === 'wrapped')
    properties.push(entry(PARAMS_FIELD, { kind: 'object', entries: [entry('type', string('object'))] }))
  return {
    kind: 'object',
    entries: [
      entry('type', string('object')),
      entry('required', { kind: 'array', items: [string(COMMAND_FIELD)] }),
      entry('properties', { kind: 'object', entries: properties }),
      entry('additionalProperties', { kind: 'boolean', value: definition.encoding === 'flat' }),
    ],
  }
}

/** The fixed English text of a rejection, followed by the menu so the next call can be right. */
export function describeCommandCallRejection(
  definition: Extract<ToolDefinition, { kind: 'commands' }>,
  rejection: CommandCallRejection,
): string {
  const reason = (() => {
    switch (rejection.kind) {
      case 'unreadable':
        return `the arguments are not JSON (${rejection.reason})`
      case 'not-object':
        return 'the arguments are not a JSON object'
      case 'command-missing':
        return 'the arguments name no command'
      case 'command-unknown':
        return `${definition.name} has no command "${rejection.command}"`
      case 'extra-field':
        return `"${rejection.field}" is not a call field; put command fields in "params"`
      case 'params-not-object':
        return '"params" is not a JSON object'
      case 'command-mismatch':
        return `the call names "${rejection.command}" but "${String(rejection.admitted)}" was admitted`
      default: {
        const exhaustive: never = rejection
        return exhaustive
      }
    }
  })()
  return `${definition.name}: ${reason}.\n${commandMenu(definition)}`
}

/** Whether a flat definition declares a field that the call itself uses. */
export function flatConflict(
  commands: readonly ToolCommandDeclaration[],
): string | undefined {
  for (const command of commands) {
    if (command.parameters.kind === 'executor-owned') return command.name
    const properties = member(command.parameters.value.schema, 'properties')
    if (properties?.kind === 'object' && properties.entries.some(item => item.key === COMMAND_FIELD))
      return command.name
  }
  return undefined
}
