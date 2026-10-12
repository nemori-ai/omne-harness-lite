import type { JsonObject, JsonValue } from '@omne-harness-lite/content-blocks'
import { object } from './json.ts'

export const PARAMETER_SCHEMA_KEYWORDS = Object.freeze([
  'type',
  'properties',
  'required',
  'description',
  'enum',
  'const',
  'items',
  'additionalProperties',
  'anyOf',
  'oneOf',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'default',
])
export function schemaPositions(schema: JsonValue): readonly JsonObject[] {
  if (!object(schema)) return []
  const result: JsonObject[] = [schema]
  if (object(schema.properties))
    for (const child of Object.values(schema.properties)) result.push(...schemaPositions(child))
  if (schema.items !== undefined) result.push(...schemaPositions(schema.items))
  if (object(schema.additionalProperties))
    result.push(...schemaPositions(schema.additionalProperties))
  for (const name of ['anyOf', 'oneOf']) {
    const branches = schema[name]
    if (Array.isArray(branches))
      for (const branch of branches) result.push(...schemaPositions(branch))
  }
  return result
}
export function descriptionMissing(schema: JsonValue): boolean {
  return schemaPositions(schema).some(
    position =>
      object(position.properties) &&
      Object.values(position.properties).some(
        child => !object(child) || !Object.hasOwn(child, 'description') || child.description === '',
      ),
  )
}
export function draftPositions(schema: JsonValue): readonly JsonObject[] {
  if (!object(schema)) return []
  const result: JsonObject[] = [schema]
  for (const key of [
    'items',
    'additionalProperties',
    'contains',
    'unevaluatedItems',
    'unevaluatedProperties',
    'propertyNames',
    'not',
    'if',
    'then',
    'else',
    'additionalItems',
  ]) {
    const value = schema[key]
    if (value !== undefined) result.push(...draftPositions(value))
  }
  for (const key of [
    'properties',
    'patternProperties',
    '$defs',
    'definitions',
    'dependentSchemas',
    'dependencies',
  ]) {
    const value = schema[key]
    if (object(value))
      for (const child of Object.values(value)) result.push(...draftPositions(child))
  }
  for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
    const value = schema[key]
    if (Array.isArray(value)) for (const child of value) result.push(...draftPositions(child))
  }
  return result
}
export function unsupportedKeyword(schema: JsonValue): boolean {
  return schemaPositions(schema).some(position =>
    Object.keys(position).some(key => !PARAMETER_SCHEMA_KEYWORDS.includes(key)),
  )
}
export function commandRelativeReference(schema: JsonValue): boolean {
  // M24 explicitly says arbitrary depth, including data, unlike the S4 positions.
  if (Array.isArray(schema)) return schema.some(commandRelativeReference)
  if (!object(schema)) return false
  return (
    Object.hasOwn(schema, '$id') ||
    (typeof schema.$ref === 'string' && schema.$ref.startsWith('#')) ||
    Object.values(schema).some(commandRelativeReference)
  )
}
