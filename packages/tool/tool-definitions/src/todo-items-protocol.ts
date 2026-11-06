import type { JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'
import { tree } from './protocol.ts'
import type { TodoAuthorCursor } from './todo-items-port.ts'

export const todoAdoption = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'todo-items-protocol',
  revision: '1',
  changes: 'Bound Session Todo commands with exact parameters and complete JSON results.',
})
export const todoCommandNames = ['help', 'add', 'remove', 'mark_complete', 'list'] as const
export type TodoCommandName = (typeof todoCommandNames)[number]
export type TodoArguments =
  | Readonly<{ kind: 'help'; name?: string }>
  | Readonly<{ kind: 'add'; text: string }>
  | Readonly<{ kind: 'remove' | 'mark_complete'; item: string }>
  | Readonly<{ kind: 'list'; after: TodoAuthorCursor | null; limit: number }>

const text = { type: 'string', minLength: 1 }
const cursor = {
  type: 'object',
  additionalProperties: false,
  required: ['tenant', 'session', 'revision', 'after'],
  properties: { tenant: text, session: text, revision: text, after: text },
}
const definitions = {
  help: {
    summary: 'Read command usage.',
    required: [],
    properties: { name: { type: 'string', enum: todoCommandNames } },
    descriptions: [{ path: 'name', text: 'Command name. Omit for the complete menu.' }],
  },
  add: {
    summary: 'Add a pending item to the current Session.',
    required: ['text'],
    properties: { text: { type: 'string', minLength: 1, maxLength: 4096 } },
    descriptions: [
      {
        path: 'text',
        text: 'Nonblank text, at most 4096 UTF-8 bytes. Original text is preserved.',
      },
    ],
  },
  remove: {
    summary: 'Remove an item from the visible list.',
    required: ['item'],
    properties: { item: text },
    descriptions: [{ path: 'item', text: 'Stable item id from a Todo receipt or list.' }],
  },
  mark_complete: {
    summary: 'Mark an item completed. Completed items remain visible.',
    required: ['item'],
    properties: { item: text },
    descriptions: [{ path: 'item', text: 'Stable item id from a Todo receipt or list.' }],
  },
  list: {
    summary: 'Read a page of pending and completed items.',
    required: [],
    properties: {
      after: { anyOf: [cursor, { type: 'null' }] },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
    descriptions: [
      {
        path: 'after',
        text: 'Complete cursor from the previous page. Omit or use null for the first page.',
      },
      { path: 'limit', text: 'Maximum items, from 1 through 100. Omit for 50.' },
    ],
  },
} satisfies Record<
  TodoCommandName,
  {
    summary: string
    required: readonly string[]
    properties: object
    descriptions: readonly { path: string; text: string }[]
  }
>

export function todoCommand(name: TodoCommandName): {
  name: TodoCommandName
  summary: string
  parameters: ParameterContract
} {
  const definition = definitions[name]
  const parameters: ParameterContract = {
    vocabulary: todoAdoption,
    schema: tree({
      type: 'object',
      additionalProperties: false,
      required: definition.required,
      properties: definition.properties,
    }),
    descriptions: definition.descriptions,
  }
  return { name, summary: definition.summary, parameters }
}
const base = createDefaultParameterCodec({
  maxBytes: 1048576,
  maxDepth: 12,
  maxItems: 128,
  maxMembers: 32,
  maxStringLength: 1048576,
  maxNumberLength: 32,
})
if ('failure' in base) throw new TypeError(base.failure.reason)
const jsonCodec = base.ok
const invalid = (field: string) =>
  fail({ kind: 'invalid', reason: `invalid-field:${field}` } as const)
function fields(value: JsonValue): ReadonlyMap<string, JsonValue> | undefined {
  return value.kind === 'object'
    ? new Map(value.entries.map(entry => [entry.key, entry.value]))
    : undefined
}
function nonempty(value: JsonValue | undefined): string | undefined {
  return value?.kind === 'string' && value.value.length > 0 ? value.value : undefined
}
function parseCursor(value: JsonValue | undefined): TodoAuthorCursor | null | undefined {
  if (value === undefined || value.kind === 'null') return null
  const values = fields(value)
  if (values === undefined || values.size !== 4) return undefined
  const tenant = nonempty(values.get('tenant'))
  const session = nonempty(values.get('session'))
  const revision = nonempty(values.get('revision'))
  const after = nonempty(values.get('after'))
  return tenant === undefined ||
    session === undefined ||
    revision === undefined ||
    after === undefined
    ? undefined
    : { tenant, session, revision, after }
}
function parseHelp(values: ReadonlyMap<string, JsonValue>) {
  const topic = values.get('name')
  if (topic === undefined) return succeed<TodoArguments>({ kind: 'help' })
  return topic.kind === 'string' && todoCommandNames.some(command => command === topic.value)
    ? succeed<TodoArguments>({ kind: 'help', name: topic.value })
    : invalid('name')
}
function parseAdd(values: ReadonlyMap<string, JsonValue>) {
  const text = nonempty(values.get('text'))
  return text !== undefined &&
    text.trim().length > 0 &&
    new TextEncoder().encode(text).byteLength <= 4096
    ? succeed<TodoArguments>({ kind: 'add', text })
    : invalid('text')
}
function parseItem(name: 'remove' | 'mark_complete', values: ReadonlyMap<string, JsonValue>) {
  const item = nonempty(values.get('item'))
  return item === undefined ? invalid('item') : succeed<TodoArguments>({ kind: name, item })
}
function parseList(values: ReadonlyMap<string, JsonValue>) {
  const after = parseCursor(values.get('after'))
  if (after === undefined) return invalid('after')
  const size = values.get('limit')
  const limit = size === undefined ? 50 : size.kind === 'number' ? Number(size.lexeme) : NaN
  return Number.isInteger(limit) && limit >= 1 && limit <= 100
    ? succeed<TodoArguments>({ kind: 'list', after, limit })
    : invalid('limit')
}
function parse(name: TodoCommandName, value: JsonValue) {
  const values = fields(value)
  if (values === undefined) return invalid('params')
  const allowed = Object.keys(definitions[name].properties)
  const extra = [...values.keys()].find(key => !allowed.includes(key))
  if (extra !== undefined) return invalid(extra)
  switch (name) {
    case 'help':
      return parseHelp(values)
    case 'add':
      return parseAdd(values)
    case 'remove':
    case 'mark_complete':
      return parseItem(name, values)
    case 'list':
      return parseList(values)
  }
}
export function todoParameterCodec(name: TodoCommandName): ParameterCodec<TodoArguments> {
  return {
    adoption: todoAdoption,
    parse(input) {
      const answer = jsonCodec.parse(input)
      return 'failure' in answer ? answer : parse(name, answer.ok)
    },
  }
}
