import { judgeJsonValue, readJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ParameterContract } from '@omne-harness/tool-contract'
import {
  createDefaultParameterCodec,
  describedAdoption,
  type ParameterCodec,
} from '@omne-harness/tool-contract/provider'

export const adoption = describedAdoption({
  owner: '@omne-harness/tool-definitions',
  name: 'files-shell-protocol',
  revision: '2',
  changes:
    'One declaration per tool with the command named in the call, usage on invalid input, help by command name and Files write with parents.',
})
const limits = {
  maxBytes: 1048576,
  maxDepth: 24,
  maxItems: 32768,
  maxMembers: 4096,
  maxStringLength: 1048576,
  maxNumberLength: 32,
}
export type Field = Readonly<{
  name: string
  kind:
    | 'string'
    | 'text'
    | 'positive'
    | 'offset'
    | 'boolean'
    | 'env'
    | 'terminal'
    | 'edits'
    | 'strings'
  required?: boolean
  choices?: readonly string[]
  description: string
}>
export type Command = Readonly<{ name: string; summary: string; fields: readonly Field[] }>
export type ExactEdit = Readonly<{ path: string; old_text: string; new_text: string }>
export function tree(value: unknown): JsonValue {
  const parsed = readJsonText(JSON.stringify(value), limits)
  if (parsed.kind !== 'ok') throw new TypeError('Invalid protocol JSON')
  return parsed.value
}
function entries(value: JsonValue) {
  return value.kind === 'object'
    ? new Map(value.entries.map(entry => [entry.key, entry.value]))
    : null
}
function validString(value: JsonValue, field: Field): boolean {
  return (
    value.kind === 'string' &&
    (field.kind === 'text' || value.value.length > 0) &&
    (field.choices === undefined || field.choices.includes(value.value))
  )
}
function validNumber(value: JsonValue, field: Field): boolean {
  return (
    value.kind === 'number' &&
    Number.isSafeInteger(Number(value.lexeme)) &&
    Number(value.lexeme) >= (field.kind === 'positive' ? 1 : 0)
  )
}
function validBoolean(value: JsonValue): boolean {
  return value.kind === 'boolean'
}
function validStrings(value: JsonValue): boolean {
  return value.kind === 'array' && value.items.every(item => item.kind === 'string')
}
function validEnv(value: JsonValue): boolean {
  return value.kind === 'object' && value.entries.every(entry => entry.value.kind === 'string')
}
function validTerminal(value: JsonValue): boolean {
  const fields = entries(value)
  return (
    fields !== null &&
    fields.size === 2 &&
    ['id', 'generation'].every(
      key => fields.get(key)?.kind === 'string' && textValue(fields.get(key)).length > 0,
    )
  )
}
function validEdit(value: JsonValue): boolean {
  const fields = entries(value)
  return (
    fields !== null &&
    fields.size === 3 &&
    ['path', 'old_text', 'new_text'].every(
      key =>
        fields.get(key)?.kind === 'string' &&
        (key === 'new_text' || textValue(fields.get(key)).length > 0),
    )
  )
}
function validEdits(value: JsonValue): boolean {
  return value.kind === 'array' && value.items.length > 0 && value.items.every(validEdit)
}
const validators: Record<Field['kind'], (value: JsonValue, field: Field) => boolean> = {
  string: validString,
  text: validString,
  positive: validNumber,
  offset: validNumber,
  boolean: validBoolean,
  strings: validStrings,
  env: validEnv,
  terminal: validTerminal,
  edits: validEdits,
}
function textValue(value: JsonValue | undefined): string {
  return value?.kind === 'string' ? value.value : ''
}

export class Arguments {
  readonly fields: ReadonlyMap<string, JsonValue>
  constructor(fields: ReadonlyMap<string, JsonValue>) {
    this.fields = fields
  }
  text(name: string): string {
    return textValue(this.fields.get(name))
  }
  optionalText(name: string): string | undefined {
    const value = this.fields.get(name)
    return value?.kind === 'string' ? value.value : undefined
  }
  number(name: string, fallback: number): number {
    const value = this.fields.get(name)
    return value?.kind === 'number' ? Number(value.lexeme) : fallback
  }
  flag(name: string): boolean {
    const value = this.fields.get(name)
    return value?.kind === 'boolean' && value.value
  }
  has(name: string): boolean {
    return this.fields.has(name)
  }
  strings(name: string): readonly string[] {
    const value = this.fields.get(name)
    return value?.kind === 'array' ? value.items.map(textValue) : []
  }
  env(name: string): Readonly<Record<string, string>> {
    const value = this.fields.get(name)
    return value?.kind === 'object'
      ? Object.fromEntries(value.entries.map(entry => [entry.key, textValue(entry.value)]))
      : {}
  }
  terminal() {
    const value = this.fields.get('terminal')
    const fields = value === undefined ? null : entries(value)
    return fields === null
      ? undefined
      : { id: textValue(fields.get('id')), generation: textValue(fields.get('generation')) }
  }
  edits(): readonly ExactEdit[] {
    const value = this.fields.get('edits')
    return value?.kind === 'array'
      ? value.items.map(item => {
          const fields = entries(item)
          return {
            path: textValue(fields?.get('path')),
            old_text: textValue(fields?.get('old_text')),
            new_text: textValue(fields?.get('new_text')),
          }
        })
      : []
  }
}

export function parseFields(value: JsonValue, fields: readonly Field[]) {
  const values = entries(value)
  if (values === null) return fail({ kind: 'invalid', reason: 'object-required' } as const)
  for (const [name, item] of values) {
    const field = fields.find(candidate => candidate.name === name)
    if (field === undefined || !validators[field.kind](item, field))
      return fail({ kind: 'invalid', reason: `invalid-field:${name}` } as const)
  }
  const missing = fields.find(field => field.required && !values.has(field.name))
  return missing === undefined
    ? succeed(new Arguments(values))
    : fail({ kind: 'invalid', reason: `missing-field:${missing.name}` } as const)
}
export function parseConstruction(value: JsonValue, fields: readonly Field[]) {
  const checked = judgeJsonValue(value, { maxVisits: limits.maxItems })
  return 'rejected' in checked
    ? fail({ kind: 'invalid', reason: `construction-json:${checked.rejected}` } as const)
    : parseFields(checked.ok, fields)
}
/**
 * The codec of one command. An invalid value is answered with its reason only; the tool host adds
 * the guide of the command, which the model reads with it (D-104).
 */
export function parameterCodec(command: Command): ParameterCodec<Arguments> {
  const base = createDefaultParameterCodec(limits)
  if ('failure' in base) throw new TypeError(base.failure.reason)
  return {
    adoption,
    parse: input => {
      const parsed = base.ok.parse(input)
      return 'failure' in parsed ? parsed : parseFields(parsed.ok, command.fields)
    },
  }
}
function fieldSchema(field: Field): unknown {
  switch (field.kind) {
    case 'string':
    case 'text':
      return stringSchema(field)
    case 'positive':
    case 'offset':
      return {
        type: 'integer',
        minimum: field.kind === 'positive' ? 1 : 0,
        maximum: Number.MAX_SAFE_INTEGER,
      }
    case 'boolean':
      return { type: 'boolean' }
    case 'strings':
      return { type: 'array', items: { type: 'string' } }
    case 'env':
      return { type: 'object', additionalProperties: { type: 'string' } }
    case 'terminal':
      return {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'generation'],
        properties: {
          id: { type: 'string', minLength: 1 },
          generation: { type: 'string', minLength: 1 },
        },
      }
    case 'edits':
      return {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'old_text', 'new_text'],
          properties: {
            path: { type: 'string', minLength: 1 },
            old_text: { type: 'string', minLength: 1 },
            new_text: { type: 'string' },
          },
        },
      }
  }
}
function stringSchema(field: Field): unknown {
  return {
    type: 'string',
    ...(field.kind === 'string' ? { minLength: 1 } : {}),
    ...(field.choices === undefined ? {} : { enum: field.choices }),
  }
}
export function contract(command: Command): ParameterContract {
  return {
    vocabulary: adoption,
    schema: tree({
      type: 'object',
      additionalProperties: false,
      required: command.fields.filter(field => field.required).map(field => field.name),
      properties: Object.fromEntries(command.fields.map(field => [field.name, fieldSchema(field)])),
    }),
    descriptions: command.fields.map(field => ({ path: field.name, text: field.description })),
  }
}
