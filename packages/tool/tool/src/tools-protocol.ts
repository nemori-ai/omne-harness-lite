import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createDefaultParameterCodec,
  decodeToolInvocationRef,
  decodeToolResultVersion,
  describedAdoption,
  type ParameterCodec,
  type ParameterContract,
  type ToolFailure,
  type ToolInvocationRef,
  type ToolResultVersion,
} from '@omne-harness/tool-contract'

export const toolsAdoption = describedAdoption({
  owner: '@omne-harness/tool',
  name: 'Tools',
  revision: '1',
})
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

export function protocol(limits: JsonLimits) {
  const allowed = (text: string) =>
    text.length <= limits.maxStringLength && Buffer.byteLength(text) <= limits.maxBytes
  function encode(prefix: string, fields: readonly (string | number)[]): string {
    return `${prefix}.${Buffer.from(JSON.stringify(fields)).toString('base64url')}`
  }
  function decode(
    text: string,
    prefix: string,
    length: number,
  ): Outcome<readonly JsonValue[], ToolFailure> {
    const bad = () =>
      fail<ToolFailure>({ kind: 'invalid-cursor', reason: 'invalid-tools-encoding' })
    if (!allowed(text) || !text.startsWith(`${prefix}.`)) return bad()
    const body = text.slice(prefix.length + 1)
    if (!/^[A-Za-z0-9_-]+$/u.test(body)) return bad()
    const bytes = Buffer.from(body, 'base64url')
    if (bytes.toString('base64url') !== body) return bad()
    const parsed = readJsonText(bytes.toString('utf8'), limits)
    if (parsed.kind !== 'ok' || parsed.value.kind !== 'array') return bad()
    const items = parsed.value.items
    if (items.length !== length || items[0]?.kind !== 'number' || items[0].lexeme !== '1')
      return bad()
    const plain = items.map(item =>
      item.kind === 'string' ? item.value : item.kind === 'number' ? Number(item.lexeme) : null,
    )
    if (
      plain.some(item => item === null) ||
      encode(
        prefix,
        plain.filter(item => item !== null),
      ) !== text
    )
      return bad()
    return succeed(items)
  }
  function readResult(text: string): Outcome<ResultReference, ToolFailure> {
    const decoded = decode(text, 'tr1', 3)
    if ('failure' in decoded) return decoded
    const [, invocation, version] = decoded.ok
    if (invocation?.kind !== 'string' || version?.kind !== 'string')
      return fail({ kind: 'invalid', field: 'reference', reason: 'result-reference' })
    const reference = decodeToolInvocationRef(invocation.value),
      result = decodeToolResultVersion(version.value)
    if ('failure' in reference || 'failure' in result || reference.ok !== invocation.value)
      return fail({ kind: 'invalid', field: 'reference', reason: 'result-reference' })
    return succeed({ reference: reference.ok, result: result.ok })
  }
  return {
    allowed,
    result: (value: ResultReference) => encode('tr1', [1, value.reference, value.result]),
    attachment: (reference: string, selector: number | 'original') =>
      encode('ta1', [1, reference, selector]),
    cursor: (kind: ReadArguments['kind'], reference: string, after: string) =>
      encode('tc1', [1, kind, reference, kind === 'result' ? 'full' : 'bytes', after]),
    readResult,
    readAttachment(text: string): Outcome<AttachmentReference, ToolFailure> {
      const decoded = decode(text, 'ta1', 3)
      if ('failure' in decoded) return decoded
      const [, reference, selector] = decoded.ok
      if (
        reference?.kind !== 'string' ||
        !(
          (selector?.kind === 'string' && selector.value === 'original') ||
          (selector?.kind === 'number' &&
            /^(0|[1-9][0-9]*)$/u.test(selector.lexeme) &&
            Number.isSafeInteger(Number(selector.lexeme)))
        )
      )
        return fail({ kind: 'invalid', field: 'reference', reason: 'attachment-selector' })
      const source = readResult(reference.value)
      if ('failure' in source) return source
      return succeed({
        source: source.ok,
        reference: reference.value,
        selector: selector.kind === 'string' ? 'original' : Number(selector.lexeme),
      })
    },
    after(input: ReadArguments): Outcome<string | null, ToolFailure> {
      if (input.after === null) return succeed(null)
      const decoded = decode(input.after, 'tc1', 5)
      if ('failure' in decoded) return decoded
      const [, kind, reference, projection, after] = decoded.ok
      if (
        kind?.kind !== 'string' ||
        kind.value !== input.kind ||
        reference?.kind !== 'string' ||
        reference.value !== input.reference ||
        projection?.kind !== 'string' ||
        projection.value !== (input.kind === 'result' ? 'full' : 'bytes') ||
        after?.kind !== 'string' ||
        after.value.length === 0
      )
        return fail({ kind: 'invalid-cursor', reason: 'another-tools-read' })
      return succeed(after.value)
    },
  }
}
