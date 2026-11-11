import type { FieldRule, FieldSchema } from './definitions.ts'
import {
  OK,
  TELEMETRY_LIMITS,
  dataMembers,
  invalid,
  isToken,
  type ValidationResult,
} from './limits.ts'

/** A reference value: a valid token of at most `maxBytes` UTF-8 bytes (ASCII, so bytes = characters). */
export function isRef(value: unknown, maxBytes: number): value is string {
  return isToken(value, Math.min(maxBytes, TELEMETRY_LIMITS.refMaxBytes))
}

function checkEnum(values: readonly string[], value: unknown): ValidationResult {
  if (typeof value !== 'string') return invalid('type')
  return values.includes(value) ? OK : invalid('not-in-enum')
}

function checkNumber(min: number, max: number, value: unknown): ValidationResult {
  if (typeof value !== 'number') return invalid('type')
  if (!Number.isFinite(value)) return invalid('not-finite')
  return value >= min && value <= max ? OK : invalid('out-of-range')
}

function checkRef(maxBytes: number, value: unknown): ValidationResult {
  if (typeof value !== 'string') return invalid('type')
  return isRef(value, maxBytes) ? OK : invalid('ref')
}

function checkValue(rule: FieldRule, value: unknown): ValidationResult {
  switch (rule.kind) {
    case 'enum':
      return checkEnum(rule.values, value)
    case 'boolean':
      return typeof value === 'boolean' ? OK : invalid('type')
    case 'number':
      return checkNumber(rule.min, rule.max, value)
    case 'ref':
      return checkRef(rule.maxBytes, value)
    default:
      // Only a definition made without defineEvent or defineMetric reaches this arm.
      return invalid('definition')
  }
}

function check(schema: FieldSchema, fields: unknown): ValidationResult {
  const rules = dataMembers(schema)
  if (rules.kind !== 'members') return invalid('definition')
  const read = dataMembers(fields)
  if (read.kind === 'not-object') return invalid('not-object')
  if (read.kind === 'accessor') return invalid('type')
  for (const key of read.members.keys())
    if (!rules.members.has(key)) return invalid('undeclared-key')
  for (const [key, rule] of Object.entries(schema)) {
    if (!read.members.has(key)) {
      if (rule.optional === true) continue
      return invalid('missing-key')
    }
    const result = checkValue(rule, read.members.get(key))
    if (result.kind === 'invalid') return result
  }
  return OK
}

/**
 * Checks actual field values (or metric labels) against the schema of a definition. Never throws:
 * an input that throws while it is read is `malformed`.
 */
export function validateFields(
  definition: Readonly<{ schema: FieldSchema }>,
  fields: unknown,
): ValidationResult {
  try {
    return check(definition.schema, fields)
  } catch {
    return invalid('malformed')
  }
}
