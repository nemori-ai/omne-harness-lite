// Test-only command schemas for exercising the public result reader through a Tool runtime.
import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  type ParameterContract,
  type ToolInvocationRef,
  type ToolResultVersion,
} from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

import { toolsAdoption } from '../src/tools-protocol.ts'
export { toolsAdoption } from '../src/tools-protocol.ts'
export type ReadArguments = Readonly<{
  kind: 'result' | 'attachment'
  reference: string
  after: string | null
}>
export type HelpArguments = Readonly<{ command: string | null }>
export type ResultReference = Readonly<{ reference: ToolInvocationRef; result: ToolResultVersion }>
export type AttachmentReference = Readonly<{
  source: ResultReference
  reference: string
  selector: number | 'original'
}>

type Field = Readonly<{
  name: string
  type: 'string' | 'nullable-string'
  required: boolean
  values: readonly string[] | null
  description: string
}>
function schemaText(fields: readonly Field[], kind?: string): string {
  return JSON.stringify({
    type: 'object',
    additionalProperties: false,
    required: fields.filter(field => field.required).map(field => field.name),
    properties: Object.fromEntries(
      fields.map(field => [
        field.name,
        {
          ...(field.type === 'nullable-string'
            ? { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] }
            : { type: 'string', ...(field.required ? { minLength: 1 } : {}) }),
          ...(field.values === null ? {} : { enum: kind === undefined ? field.values : [kind] }),
        },
      ]),
    ),
  })
}
const helpFields: readonly Field[] = [
  {
    name: 'command',
    type: 'string',
    required: false,
    values: null,
    description: 'Omit to list commands. Name a command for its complete schema and usage.',
  },
]
const readFields: readonly Field[] = [
  {
    name: 'kind',
    type: 'string',
    required: true,
    values: ['result', 'attachment'],
    description: 'Read result content blocks or attachment bytes.',
  },
  {
    name: 'reference',
    type: 'string',
    required: true,
    values: null,
    description: 'Copy the tr1 result reference or ta1 attachment reference from the response.',
  },
  {
    name: 'after',
    type: 'nullable-string',
    required: true,
    values: null,
    description:
      'Use null to start. Copy the previous tc1 next to continue. A null next means end.',
  },
]
export const commandDescriptions = [
  {
    name: 'help',
    summary: 'List commands or explain one command.',
    synopsis: '{"command":"read_result"}',
    fields: helpFields,
    schema: schemaText(helpFields),
  },
  {
    name: 'read_result',
    summary: 'Read one fixed result page or attachment byte page.',
    synopsis: '{"kind":"result","reference":"<tr1>","after":null}',
    fields: readFields,
    schema: JSON.stringify({
      oneOf: (readFields.find(field => field.name === 'kind')?.values ?? []).map(kind =>
        JSON.parse(schemaText(readFields, kind)),
      ),
    }),
  },
] as const
export type CommandDescription = (typeof commandDescriptions)[number]

function tree(text: string): JsonValue {
  const read = readJsonText(text, {
    maxBytes: 65536,
    maxDepth: 24,
    maxItems: 1024,
    maxMembers: 1024,
    maxStringLength: 65536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new TypeError('Tools schema does not parse')
  return read.value
}
export function parameterContract(command: CommandDescription): ParameterContract {
  return {
    schema: tree(command.schema),
    vocabulary: toolsAdoption,
    descriptions: command.fields.map(field => ({ path: field.name, text: field.description })),
  }
}
function invalid(reason: string) {
  return fail({ kind: 'invalid', reason } as const)
}
function parseFields(value: JsonValue, fields: readonly Field[]) {
  if (value.kind !== 'object') return invalid('object-required')
  const result = new Map<string, string | null>()
  for (const entry of value.entries) {
    const field = fields.find(item => item.name === entry.key)
    if (field === undefined) return invalid('unknown-field')
    if (entry.value.kind === 'null' && field.type === 'nullable-string') result.set(entry.key, null)
    else if (
      entry.value.kind === 'string' &&
      (!field.required || entry.value.value.length > 0) &&
      (field.values === null || field.values.includes(entry.value.value))
    )
      result.set(entry.key, entry.value.value)
    else return invalid('field-type-or-value')
  }
  if (fields.some(field => field.required && !result.has(field.name)))
    return invalid('missing-field')
  return succeed(result)
}
export function parameterCodecs(
  limits: JsonLimits,
): Readonly<{ help: ParameterCodec<HelpArguments>; read: ParameterCodec<ReadArguments> }> {
  const base = createDefaultParameterCodec(limits)
  if ('failure' in base) throw new TypeError('Invalid Tools argument limits')
  const help: ParameterCodec<HelpArguments> = {
    adoption: describedAdoption({
      owner: toolsAdoption.owner,
      name: 'Tools.help.parameters',
      revision: '1',
      limits,
    }),
    parse(input) {
      const parsed = base.ok.parse(input)
      if ('failure' in parsed) return parsed
      const fields = parseFields(parsed.ok, helpFields)
      if ('failure' in fields) return fields
      return succeed({ command: fields.ok.get('command') ?? null })
    },
  }
  const read: ParameterCodec<ReadArguments> = {
    adoption: describedAdoption({
      owner: toolsAdoption.owner,
      name: 'Tools.read_result.parameters',
      revision: '1',
      limits,
    }),
    parse(input) {
      const parsed = base.ok.parse(input)
      if ('failure' in parsed) return parsed
      const fields = parseFields(parsed.ok, readFields)
      if ('failure' in fields) return fields
      const kind = fields.ok.get('kind'),
        reference = fields.ok.get('reference'),
        after = fields.ok.get('after')
      if (
        (kind !== 'result' && kind !== 'attachment') ||
        typeof reference !== 'string' ||
        after === undefined
      )
        return invalid('missing-field')
      return succeed({ kind, reference, after })
    },
  }
  return { help, read }
}
