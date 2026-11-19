import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'
import type { FormField } from './value-control.ts'

/** What a person put into one field; a field never touched is not in the body at all. */
export type Entered = Readonly<Record<string, string | boolean>>

export type BodyRead =
  | Readonly<{ kind: 'body'; body: JsonValue }>
  | Readonly<{ kind: 'invalid'; reason: string }>

const LIMITS: JsonLimits = {
  maxBytes: 1024 * 1024,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 10_000,
  maxStringLength: 1024 * 1024,
  maxNumberLength: 64,
}

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/

function valueOf(field: FormField, entered: string | boolean): JsonValue | string {
  switch (field.control.kind) {
    case 'switch':
      return { kind: 'boolean', value: entered === true }
    case 'number': {
      const lexeme = String(entered).trim()
      return NUMBER.test(lexeme)
        ? { kind: 'number', lexeme }
        : `「${field.title ?? field.key}」不是一个数。`
    }
    case 'text':
    case 'pick':
      return { kind: 'string', value: String(entered) }
  }
}

/** The body from the fields; an empty text in a field that is not required is left out. */
export function bodyOfFields(fields: readonly FormField[], entered: Entered): BodyRead {
  const entries: { key: string; value: JsonValue }[] = []
  for (const field of fields) {
    const given = entered[field.key]
    if (given === undefined || (given === '' && !field.required)) continue
    const value = valueOf(field, given)
    if (typeof value === 'string') return { kind: 'invalid', reason: value }
    entries.push({ key: field.key, value })
  }
  return { kind: 'body', body: { kind: 'object', entries } }
}

export function bodyOfText(text: string): BodyRead {
  const read = readJsonText(text, LIMITS)
  return read.kind === 'ok'
    ? { kind: 'body', body: read.value }
    : { kind: 'invalid', reason: '这不是一段合法的 JSON。' }
}
