import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  InspectArguments,
  ParameterContract,
  SearchArguments,
  ToolForwardIntent,
  ToolsReadArguments,
} from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  decodeToolInvocationRef,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const toolsProtocol = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'Tools.protocol',
  revision: '1',
})
export const toolsArgumentLimits = {
  maxBytes: 65536,
  maxDepth: 32,
  maxItems: 4096,
  maxMembers: 256,
  maxStringLength: 32768,
  maxNumberLength: 64,
}
const string = { type: 'string', minLength: 1 }
const nullableString = { anyOf: [string, { type: 'null' }] }
const object = (properties: object, required: readonly string[]) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
})

export const toolsCommands = [
  {
    name: 'help',
    summary: 'List commands or show the exact schema of one command.',
    schema: object({ command: string }, []),
  },
  {
    name: 'search',
    summary: 'Search current lawful nonresident tools with BM25. Copy next to continue.',
    schema: object(
      {
        query: { type: 'string' },
        after: nullableString,
        limit: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
      ['query', 'after', 'limit'],
    ),
  },
  {
    name: 'inspect',
    summary: 'Inspect a tool overview (command=null) or one command and its parameters.',
    schema: object({ name: string, command: nullableString }, ['name', 'command']),
  },
  {
    name: 'execute',
    summary:
      'Invoke one current lawful nonresident target through the Tool runtime. Resident tools require direct calls. A pending response is not completion.',
    schema: object({ name: string, command: nullableString, arguments: {} }, [
      'name',
      'command',
      'arguments',
    ]),
  },
  {
    name: 'read_result',
    summary:
      'Read a fixed result or attachment, query an invocation, or recover an existing forwarding slot.',
    schema: {
      oneOf: ['result', 'attachment', 'invocation', 'forwarding'].map(kind =>
        object(
          {
            kind: { const: kind },
            reference: string,
            after: kind === 'result' || kind === 'attachment' ? nullableString : { type: 'null' },
          },
          ['kind', 'reference', 'after'],
        ),
      ),
    },
  },
] as const
export type ToolsCommandName = (typeof toolsCommands)[number]['name']
export type ParsedToolsCommand =
  | Readonly<{ kind: 'help'; command: string | null }>
  | Readonly<{ kind: 'search'; arguments: SearchArguments }>
  | Readonly<{ kind: 'inspect'; arguments: InspectArguments }>
  | Readonly<{ kind: 'execute'; arguments: ToolForwardIntent }>
  | Readonly<{ kind: 'read_result'; arguments: ToolsReadArguments }>

export function toolsParameterContract(command: (typeof toolsCommands)[number]): ParameterContract {
  const parsed = readJsonText(JSON.stringify(command.schema), toolsArgumentLimits)
  if (parsed.kind !== 'ok') throw new TypeError('Tools schema is not bounded JSON')
  return { schema: parsed.value, vocabulary: toolsProtocol, descriptions: [] }
}
const invalid = () => fail({ kind: 'invalid' as const, reason: 'invalid-tools-parameters' })
const text = (value: JsonValue | undefined, empty = false) =>
  value?.kind === 'string' && (empty || value.value.length > 0) ? value.value : undefined
const nullableText = (value: JsonValue | undefined) => (value?.kind === 'null' ? null : text(value))

function fields(value: JsonValue, required: readonly string[], optional: readonly string[] = []) {
  if (value.kind !== 'object') return null
  const map = new Map(value.entries.map(entry => [entry.key, entry.value]))
  return required.some(key => !map.has(key)) ||
    [...map.keys()].some(key => !required.includes(key) && !optional.includes(key))
    ? null
    : map
}

function parseRead(
  value: JsonValue,
): Outcome<ParsedToolsCommand, { kind: 'invalid'; reason: string }> {
  const map = fields(value, ['kind', 'reference', 'after'])
  if (map === null) return invalid()
  const kind = text(map.get('kind')),
    reference = text(map.get('reference')),
    after = nullableText(map.get('after'))
  if (reference === undefined || after === undefined) return invalid()
  if (kind === 'result' || kind === 'attachment')
    return succeed({ kind: 'read_result', arguments: { kind, reference, after } })
  if ((kind !== 'invocation' && kind !== 'forwarding') || after !== null) return invalid()
  const decoded = decodeToolInvocationRef(reference)
  return 'failure' in decoded
    ? invalid()
    : succeed({ kind: 'read_result', arguments: { kind, reference: decoded.ok, after: null } })
}

function parseCommand(
  name: ToolsCommandName,
  value: JsonValue,
): Outcome<ParsedToolsCommand, { kind: 'invalid'; reason: string }> {
  if (name === 'read_result') return parseRead(value)
  if (name === 'help') {
    const map = fields(value, [], ['command'])
    if (map === null || (map.has('command') && text(map.get('command')) === undefined))
      return invalid()
    return succeed({ kind: 'help', command: text(map.get('command')) ?? null })
  }
  if (name === 'search') {
    const map = fields(value, ['query', 'after', 'limit'])
    if (map === null) return invalid()
    const query = text(map.get('query'), true),
      after = nullableText(map.get('after')),
      count = map.get('limit')
    const limit = count?.kind === 'number' ? Number(count.lexeme) : NaN
    return query === undefined || after === undefined || !Number.isSafeInteger(limit) || limit < 1
      ? invalid()
      : succeed({ kind: 'search', arguments: { query, after, limit } })
  }
  const map = fields(
    value,
    name === 'inspect' ? ['name', 'command'] : ['name', 'command', 'arguments'],
  )
  if (map === null) return invalid()
  const target = text(map.get('name')),
    command = nullableText(map.get('command'))
  if (target === undefined || command === undefined) return invalid()
  if (name === 'inspect') return succeed({ kind: 'inspect', arguments: { name: target, command } })
  const args = map.get('arguments')
  return args === undefined
    ? invalid()
    : succeed({ kind: 'execute', arguments: { name: target, command, arguments: args } })
}

export function toolsParameterCodec(name: ToolsCommandName): ParameterCodec<ParsedToolsCommand> {
  const base = createDefaultParameterCodec(toolsArgumentLimits)
  if ('failure' in base) throw new TypeError('Invalid Tools argument budget')
  return {
    adoption: toolsProtocol,
    parse(input) {
      const parsed = base.ok.parse(input)
      return 'failure' in parsed ? parsed : parseCommand(name, parsed.ok)
    },
  }
}
