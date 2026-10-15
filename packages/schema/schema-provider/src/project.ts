import type { JsonValue } from '@omne-harness/json-text'
import type { NumberProjection, SchemaIssue } from './index.ts'

export type Projected =
  | { readonly kind: 'value'; readonly value: unknown }
  | { readonly kind: 'invalid'; readonly issues: readonly [SchemaIssue, ...SchemaIssue[]] }

export function project(value: JsonValue, numbers: NumberProjection): Projected {
  return projectAt(value, numbers, [])
}

function projectAt(
  value: JsonValue,
  numbers: NumberProjection,
  path: readonly (string | number)[],
): Projected {
  switch (value.kind) {
    case 'null':
      return { kind: 'value', value: null }
    case 'boolean':
    case 'string':
      return { kind: 'value', value: value.value }
    case 'number':
      return projectNumber(value.lexeme, numbers, path)
    case 'array':
      return projectArray(value.items, numbers, path)
    case 'object':
      return projectObject(value.entries, numbers, path)
    default: {
      const unreachable: never = value
      return unreachable
    }
  }
}

function projectNumber(
  lexeme: string,
  numbers: NumberProjection,
  path: readonly (string | number)[],
): Projected {
  if (numbers === 'lexeme') return { kind: 'value', value: lexeme }
  const value = Number(lexeme)
  if (Number.isFinite(value) && JSON.stringify(value) === lexeme) {
    return { kind: 'value', value }
  }
  return { kind: 'invalid', issues: [{ path, code: 'precision' }] }
}

function projectArray(
  items: readonly JsonValue[],
  numbers: NumberProjection,
  path: readonly (string | number)[],
): Projected {
  const projected: unknown[] = []
  const issues: SchemaIssue[] = []
  items.forEach((item, index) => {
    const child = projectAt(item, numbers, [...path, index])
    if (child.kind === 'value') projected.push(child.value)
    else issues.push(...child.issues)
  })
  return pack(projected, issues)
}

function projectObject(
  entries: readonly { readonly key: string; readonly value: JsonValue }[],
  numbers: NumberProjection,
  path: readonly (string | number)[],
): Projected {
  const projected: Record<string, unknown> = {}
  const issues: SchemaIssue[] = []
  for (const entry of entries) {
    const child = projectAt(entry.value, numbers, [...path, entry.key])
    if (child.kind === 'value') projected[entry.key] = child.value
    else issues.push(...child.issues)
  }
  return pack(projected, issues)
}

function pack(value: unknown, issues: readonly SchemaIssue[]): Projected {
  const first = issues[0]
  if (first === undefined) return { kind: 'value', value }
  return { kind: 'invalid', issues: [first, ...issues.slice(1)] }
}
