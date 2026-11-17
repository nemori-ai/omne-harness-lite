import {
  readJsonText,
  writeJsonText,
  type JsonEntry,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolArguments, ToolCommandDeclaration, ToolDefinition } from './definitions.ts'
import { returnGuide, returnSummary } from './return-description.ts'

export const COMMAND_CALL_ENCODINGS = ['wrapped', 'flat'] as const
export type CommandCallEncoding = (typeof COMMAND_CALL_ENCODINGS)[number]

export const COMMAND_FIELD = 'command'
export const PARAMS_FIELD = 'params'
export const INTENT_FIELD = 'intent'
/** The upper bound of an intent in UTF-8 bytes. */
export const INTENT_MAX_BYTES = 256

type JsonObject = Extract<JsonValue, { kind: 'object' }>
export type CommandTable = Pick<
  Extract<ToolDefinition, { kind: 'commands' }>,
  'name' | 'encoding' | 'commands' | 'guide'
>
/** What decoding needs from a command tool: the encoding and which commands may run in the background. */
export type CommandShape = Readonly<{
  encoding: CommandCallEncoding
  commands: readonly Pick<ToolCommandDeclaration, 'name' | 'background'>[]
}>
/** A decoded call. The intent only names the call; the author receives the params alone. */
export type CommandCall = Readonly<{ command: string; intent: string | null; params: JsonObject }>
export type IntentFault = 'not-text' | 'blank' | 'multiline' | 'too-long'

export type CommandCallRejection =
  | Readonly<{ kind: 'unreadable'; reason: string }>
  | Readonly<{ kind: 'not-object' }>
  | Readonly<{ kind: 'command-missing' }>
  | Readonly<{ kind: 'command-unknown'; command: string }>
  | Readonly<{ kind: 'extra-field'; field: string }>
  | Readonly<{ kind: 'params-not-object' }>
  | Readonly<{ kind: 'command-mismatch'; command: string; admitted: string | null }>
  | Readonly<{ kind: 'intent-missing'; command: string }>
  | Readonly<{ kind: 'intent-invalid'; command: string; fault: IntentFault }>

const EMPTY: JsonObject = Object.freeze({ kind: 'object', entries: Object.freeze([]) })
const CALL_LIMITS: JsonLimits = {
  maxBytes: 4194304,
  maxDepth: 64,
  maxItems: 65536,
  maxMembers: 8192,
  maxStringLength: 4194304,
  maxNumberLength: 64,
}

const UTF8 = new TextEncoder()

/** Why an intent value is not one line of text within the byte bound, or null when it is. */
export function intentFault(value: unknown): IntentFault | null {
  if (typeof value !== 'string') return 'not-text'
  if (value.trim().length === 0) return 'blank'
  if (/[\r\n\u2028\u2029]/u.test(value)) return 'multiline'
  return UTF8.encode(value).length > INTENT_MAX_BYTES ? 'too-long' : null
}

/** A command that declares background permission needs an intent; others may give one. */
export function needsIntent(shape: CommandShape, command: string | null): boolean {
  return shape.commands.some(entry => entry.name === command && entry.background !== undefined)
}

function intentIn(
  shape: CommandShape,
  command: string,
  value: JsonObject,
): Outcome<string | null, CommandCallRejection> {
  const given = value.entries.find(entry => entry.key === INTENT_FIELD)?.value
  if (given === undefined)
    return needsIntent(shape, command) ? fail({ kind: 'intent-missing', command }) : succeed(null)
  const fault = intentFault(given.kind === 'string' ? given.value : given)
  return fault === null && given.kind === 'string'
    ? succeed(given.value)
    : fail({ kind: 'intent-invalid', command, fault: fault ?? 'not-text' })
}

export function decodeCommandCall(
  shape: CommandShape,
  value: JsonValue,
): Outcome<CommandCall, CommandCallRejection> {
  if (value.kind !== 'object') return fail({ kind: 'not-object' })
  const selected = commandIn(namesOf(shape), value)
  if ('failure' in selected) return selected
  const command = selected.ok
  const intent = intentIn(shape, command, value)
  if ('failure' in intent) return intent
  const rest = value.entries.filter(
    entry => entry.key !== COMMAND_FIELD && entry.key !== INTENT_FIELD,
  )
  if (shape.encoding === 'flat')
    return succeed({ command, intent: intent.ok, params: { kind: 'object', entries: rest } })
  const extra = rest.find(entry => entry.key !== PARAMS_FIELD)
  if (extra !== undefined) return fail({ kind: 'extra-field', field: extra.key })
  const params = rest[0]?.value ?? EMPTY
  return params.kind === 'object'
    ? succeed({ command, intent: intent.ok, params })
    : fail({ kind: 'params-not-object' })
}

function namesOf(shape: CommandShape): readonly string[] {
  return shape.commands.map(entry => entry.name)
}

export function selectCommand(
  commands: readonly string[],
  value: JsonValue,
): Outcome<string, CommandCallRejection> {
  return value.kind === 'object' ? commandIn(commands, value) : fail({ kind: 'not-object' })
}

function commandIn(
  commands: readonly string[],
  value: JsonObject,
): Outcome<string, CommandCallRejection> {
  const named = value.entries.find(entry => entry.key === COMMAND_FIELD)
  if (named === undefined || named.value.kind !== 'string') return fail({ kind: 'command-missing' })
  const command = named.value.value
  return commands.includes(command) ? succeed(command) : fail({ kind: 'command-unknown', command })
}

export function selectCommandText(
  commands: readonly string[],
  text: string,
): Outcome<string, CommandCallRejection> {
  const read = readJsonText(text, CALL_LIMITS)
  if (read.kind !== 'ok') return fail({ kind: 'unreadable', reason: read.kind })
  return selectCommand(commands, read.value)
}

export function encodeCommandCall(encoding: CommandCallEncoding, call: CommandCall): JsonObject {
  const command: JsonEntry = { key: COMMAND_FIELD, value: { kind: 'string', value: call.command } }
  const intent: JsonEntry[] =
    call.intent === null
      ? []
      : [{ key: INTENT_FIELD, value: { kind: 'string', value: call.intent } }]
  return {
    kind: 'object',
    entries:
      encoding === 'flat'
        ? [command, ...intent, ...call.params.entries]
        : [command, ...intent, { key: PARAMS_FIELD, value: call.params }],
  }
}

export function decodeCommandCallText(
  shape: CommandShape,
  text: string,
): Outcome<CommandCall, CommandCallRejection> {
  const read = readJsonText(text, CALL_LIMITS)
  if (read.kind !== 'ok') return fail({ kind: 'unreadable', reason: read.kind })
  return decodeCommandCall(shape, read.value)
}

export function commandArguments(
  definition: ToolDefinition,
  admitted: string | null,
  args: ToolArguments,
): Outcome<ToolArguments, Readonly<{ kind: 'invalid'; reason: string }>> {
  if (definition.kind === 'function' || !args.complete) return succeed(args)
  const call = decodeCommandCallText(definition, args.effective)
  if ('failure' in call) return fail({ kind: 'invalid', reason: rejectionText(call.failure) })
  if (call.ok.command !== admitted) {
    const mismatch: CommandCallRejection = {
      kind: 'command-mismatch',
      command: call.ok.command,
      admitted,
    }
    return fail({ kind: 'invalid', reason: rejectionText(mismatch) })
  }
  return succeed({ ...args, effective: writeJsonText(call.ok.params) })
}

function member(value: JsonValue, key: string): JsonValue | undefined {
  return value.kind === 'object' ? value.entries.find(entry => entry.key === key)?.value : undefined
}
function strings(value: JsonValue | undefined): readonly string[] {
  return value?.kind === 'array'
    ? value.items.flatMap(item => (item.kind === 'string' ? [item.value] : []))
    : []
}

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

const INTENT_EXAMPLE = '"intent": "<one line: why you make this call>"'

export function commandExample(definition: CommandTable, command: string): string {
  const found = definition.commands.find(item => item.name === command)
  const signature = found === undefined ? '{…}' : commandSignature(found.parameters)
  const fields = signature.slice(1, -1)
  const intent = needsIntent(definition, command) ? `, ${INTENT_EXAMPLE}` : ''
  return definition.encoding === 'flat'
    ? `${definition.name} {"command": "${command}"${intent}${fields === '' ? '' : `, ${fields}`}}`
    : `${definition.name} {"command": "${command}"${intent}, "params": ${signature}}`
}

export function commandMenu(definition: CommandTable): string {
  const form =
    definition.encoding === 'flat'
      ? '{"command": <name>, …fields}'
      : '{"command": <name>, "params": {…fields}}'
  return [
    `Call with ${form}. In signatures, ? marks an optional field and a|b lists the allowed values.`,
    ...definition.commands.map(
      command =>
        `${command.name} ${commandSignature(command.parameters)} - ${command.summary} ${returnSummary(command.returns)}${command.background === undefined ? '' : INTENT_NOTE}`,
    ),
  ].join('\n')
}

const INTENT_NOTE = ' The call also needs "intent": one line saying why you make it.'

const string = (value: string): JsonValue => ({ kind: 'string', value })
const entry = (key: string, value: JsonValue): JsonEntry => ({ key, value })

export function commandCallSchema(definition: CommandTable): JsonValue {
  const command = {
    kind: 'object' as const,
    entries: [
      entry('type', string('string')),
      entry('enum', { kind: 'array', items: definition.commands.map(item => string(item.name)) }),
    ],
  }
  const properties: JsonEntry[] = [entry(COMMAND_FIELD, command)]
  if (definition.commands.some(item => item.background !== undefined))
    properties.push(
      entry(INTENT_FIELD, {
        kind: 'object',
        entries: [
          entry('type', string('string')),
          entry(
            'description',
            string('One line saying why you make this call. Required by the commands that say so.'),
          ),
        ],
      }),
    )
  if (definition.encoding === 'wrapped')
    properties.push(
      entry(PARAMS_FIELD, { kind: 'object', entries: [entry('type', string('object'))] }),
    )
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

function rejectionText(rejection: CommandCallRejection): string {
  switch (rejection.kind) {
    case 'unreadable':
      return `the arguments are not JSON (${rejection.reason})`
    case 'not-object':
      return 'the arguments are not a JSON object'
    case 'command-missing':
      return 'the arguments name no command'
    case 'command-unknown':
      return `there is no command "${rejection.command}"`
    case 'extra-field':
      return `"${rejection.field}" is not a call field; put command fields in "params"`
    case 'params-not-object':
      return '"params" is not a JSON object'
    case 'command-mismatch':
      return `the call names "${rejection.command}" but "${String(rejection.admitted)}" was admitted`
    case 'intent-missing':
      return `"${rejection.command}" needs "intent": one line saying why you make this call`
    case 'intent-invalid':
      return `"intent" must be one line of text of at most ${INTENT_MAX_BYTES} bytes (${rejection.fault})`
    default: {
      const exhaustive: never = rejection
      return exhaustive
    }
  }
}

export function commandGuide(definition: CommandTable, command?: string): string {
  const found = definition.commands.find(item => item.name === command)
  const body = found === undefined ? [commandMenu(definition)] : commandUsage(definition, found)
  return [...body, ...(definition.guide === undefined ? [] : [definition.guide])].join('\n')
}

function commandUsage(definition: CommandTable, command: ToolCommandDeclaration): string[] {
  const lines = [`Usage: ${commandExample(definition, command.name)}`, command.summary]
  if (command.parameters.kind === 'executor-owned') return [...lines, returnGuide(command.returns)]
  const { schema, descriptions } = command.parameters.value
  return [
    ...lines,
    `JSON Schema: ${writeJsonText(schema)}`,
    ...descriptions.map(item => `${item.path}: ${item.text}`),
    returnGuide(command.returns),
  ]
}

export function describeCommandCallRejection(
  definition: CommandTable,
  rejection: CommandCallRejection,
): string {
  const usage =
    rejection.kind === 'intent-missing' || rejection.kind === 'intent-invalid'
      ? commandGuide(definition, rejection.command)
      : commandGuide(definition)
  return `${definition.name}: ${rejectionText(rejection)}.\n${usage}`
}

export function describeCommandArgumentsRejection(
  definition: CommandTable,
  command: string,
  reason: string,
): string {
  return `${definition.name} ${command}: ${reason}.\n${commandGuide(definition, command)}`
}

export function flatConflict(
  commands: readonly Pick<ToolCommandDeclaration, 'name' | 'parameters'>[],
): string | undefined {
  for (const command of commands) {
    if (command.parameters.kind === 'executor-owned') return command.name
    const properties = member(command.parameters.value.schema, 'properties')
    if (
      properties?.kind === 'object' &&
      properties.entries.some(item => item.key === COMMAND_FIELD || item.key === INTENT_FIELD)
    )
      return command.name
  }
  return undefined
}
