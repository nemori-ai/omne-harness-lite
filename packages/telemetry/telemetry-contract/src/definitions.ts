import { TELEMETRY_LIMITS, dataMembers, isToken } from './limits.ts'

/**
 * The rule of one field. There is no free-text rule: a string is an enum value or an opaque
 * reference with a restricted character set. `optional: true` lets the field be absent; a present
 * field is checked as usual. The marker is `true` or absent, never `false`.
 */
export type FieldRule =
  | Readonly<{ kind: 'enum'; values: readonly [string, ...string[]]; optional?: true }>
  | Readonly<{ kind: 'boolean'; optional?: true }>
  | Readonly<{ kind: 'number'; min: number; max: number; optional?: true }>
  | Readonly<{ kind: 'ref'; owner: string; maxBytes: number; optional?: true }>
export type FieldSchema = Readonly<Record<string, FieldRule>>

/** The rule of one metric label: bounded cardinality only. */
export type LabelRule = Extract<FieldRule, { kind: 'enum' | 'boolean' }>
export type LabelSchema = Readonly<Record<string, LabelRule>>

type FieldValue<R extends FieldRule> = R extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : R extends { kind: 'boolean' }
    ? boolean
    : R extends { kind: 'number' }
      ? number
      : R extends { kind: 'ref' }
        ? string
        : never

type OptionalKeys<S extends FieldSchema> = {
  [K in keyof S]: S[K] extends { optional: true } ? K : never
}[keyof S]

/** One object type with the modifiers of the intersection, so that a value type reads as one shape. */
type Flat<T> = { [K in keyof T]: T[K] }

/**
 * The field values that a schema declares: every declared key, and no other key. A key whose rule
 * says `optional: true` may be omitted.
 */
export type Fields<S extends FieldSchema> = Flat<
  { readonly [K in Exclude<keyof S, OptionalKeys<S>>]: FieldValue<S[K]> } & {
    readonly [K in OptionalKeys<S>]?: FieldValue<S[K]>
  }
>

export type EventDefinition<S extends FieldSchema> = Readonly<{
  signal: 'event'
  owner: string
  name: string
  version: number
  level: 'error' | 'warn' | 'info' | 'debug'
  schema: S
}>

export type MetricDefinition<S extends LabelSchema> = Readonly<{
  signal: 'metric'
  owner: string
  name: string
  version: number
  unit: 's' | 'By' | '1' | 'token'
  aggregation:
    | Readonly<{ kind: 'counter' }>
    | Readonly<{ kind: 'gauge' }>
    | Readonly<{ kind: 'histogram'; boundaries: readonly number[] }>
  schema: S
}>

export type SegmentDefinition = Readonly<{
  signal: 'segment'
  owner: string
  name: string
  version: number
}>

const LEVELS = ['error', 'warn', 'info', 'debug'] as const
const UNITS = ['s', 'By', '1', 'token'] as const
const FIELD_KINDS = ['enum', 'boolean', 'number', 'ref'] as const
const LABEL_KINDS = ['enum', 'boolean'] as const

function isOneOf<const T extends string>(value: unknown, list: readonly T[]): value is T {
  return list.some(item => item === value)
}

function fail(message: string): never {
  throw new TypeError(`telemetry definition: ${message}`)
}

function members(value: unknown, what: string): ReadonlyMap<PropertyKey, unknown> {
  const read = dataMembers(value)
  if (read.kind !== 'members') return fail(`${what} must be a plain object with data members`)
  return read.members
}

function head(input: ReadonlyMap<PropertyKey, unknown>): {
  owner: string
  name: string
  version: number
} {
  const owner = input.get('owner')
  const name = input.get('name')
  const version = input.get('version')
  if (!isToken(owner, TELEMETRY_LIMITS.ownerMaxLength)) fail('owner is not a valid token')
  if (!isToken(name, TELEMETRY_LIMITS.nameMaxLength)) fail('name is not a valid token')
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
    fail('version must be a positive integer')
  return { owner, name, version }
}

function enumRule(rule: ReadonlyMap<PropertyKey, unknown>): FieldRule {
  const values = rule.get('values')
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > TELEMETRY_LIMITS.maxEnumValues
  )
    fail(`an enum has 1 to ${TELEMETRY_LIMITS.maxEnumValues} values`)
  const copy: string[] = []
  for (const value of values) {
    if (!isToken(value, TELEMETRY_LIMITS.enumValueMaxLength))
      fail('an enum value is not a valid token')
    if (copy.includes(value)) fail(`the enum value ${value} repeats`)
    copy.push(value)
  }
  const [first, ...rest] = copy
  if (first === undefined) return fail('an enum has no value')
  return Object.freeze({ kind: 'enum', values: Object.freeze([first, ...rest] as const) })
}

function numberRule(rule: ReadonlyMap<PropertyKey, unknown>): FieldRule {
  const min = rule.get('min')
  const max = rule.get('max')
  if (
    typeof min !== 'number' ||
    typeof max !== 'number' ||
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  )
    fail('number bounds must be finite numbers')
  if (min > max) fail('the minimum is above the maximum')
  return Object.freeze({ kind: 'number', min, max })
}

function refRule(rule: ReadonlyMap<PropertyKey, unknown>): FieldRule {
  const owner = rule.get('owner')
  const maxBytes = rule.get('maxBytes')
  if (!isToken(owner, TELEMETRY_LIMITS.ownerMaxLength)) fail('a ref owner is not a valid token')
  if (
    typeof maxBytes !== 'number' ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > TELEMETRY_LIMITS.refMaxBytes
  )
    fail(`ref maxBytes must be an integer from 1 to ${TELEMETRY_LIMITS.refMaxBytes}`)
  return Object.freeze({ kind: 'ref', owner, maxBytes })
}

function valueRule(kind: FieldRule['kind'], rule: ReadonlyMap<PropertyKey, unknown>): FieldRule {
  if (kind === 'enum') return enumRule(rule)
  if (kind === 'number') return numberRule(rule)
  if (kind === 'ref') return refRule(rule)
  return Object.freeze({ kind: 'boolean' })
}

function copyRule(value: unknown, kinds: readonly FieldRule['kind'][]): FieldRule {
  const rule = members(value, 'a rule')
  const kind = rule.get('kind')
  if (!isOneOf(kind, kinds)) return fail(`the rule kind ${String(kind)} is not allowed here`)
  const optional = rule.get('optional')
  if (optional !== undefined && optional !== true) fail('optional is true or absent')
  const copy = valueRule(kind, rule)
  return optional === true ? Object.freeze({ ...copy, optional }) : copy
}

function copySchema(
  value: unknown,
  kinds: readonly FieldRule['kind'][],
): Record<string, FieldRule> {
  const schema = members(value, 'schema')
  if (schema.size > TELEMETRY_LIMITS.maxFields)
    fail(`a schema has at most ${TELEMETRY_LIMITS.maxFields} fields`)
  const copy: Record<string, FieldRule> = {}
  for (const [key, rule] of schema) {
    if (typeof key !== 'string' || !isToken(key, TELEMETRY_LIMITS.nameMaxLength))
      fail('a field name is not a valid token')
    copy[key] = copyRule(rule, kinds)
  }
  return Object.freeze(copy)
}

function histogramBoundaries(value: unknown): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > TELEMETRY_LIMITS.maxHistogramBoundaries
  )
    fail(`a histogram has 1 to ${TELEMETRY_LIMITS.maxHistogramBoundaries} boundaries`)
  const copy: number[] = []
  for (const boundary of value) {
    const previous = copy.at(-1)
    if (typeof boundary !== 'number' || !Number.isFinite(boundary))
      fail('a histogram boundary must be a finite number')
    if (previous !== undefined && boundary <= previous) fail('histogram boundaries must increase')
    copy.push(boundary)
  }
  return Object.freeze(copy)
}

function aggregation(value: unknown): MetricDefinition<LabelSchema>['aggregation'] {
  const read = members(value, 'aggregation')
  const kind = read.get('kind')
  if (kind === 'counter' || kind === 'gauge') return Object.freeze({ kind })
  if (kind !== 'histogram') return fail(`the aggregation ${String(kind)} is not known`)
  return Object.freeze({ kind, boundaries: histogramBoundaries(read.get('boundaries')) })
}

/**
 * Declares one event. The definition is a frozen copy of the input. Throws TypeError for an
 * invalid definition. Nothing is registered: two calls with the same name make two definitions.
 */
export function defineEvent<const S extends FieldSchema>(
  input: Readonly<{
    owner: string
    name: string
    version: number
    level: EventDefinition<S>['level']
    schema: S
  }>,
): EventDefinition<S> {
  const read = members(input, 'an event definition')
  const level = read.get('level')
  if (!isOneOf(level, LEVELS)) return fail(`the level ${String(level)} is not known`)
  return Object.freeze({
    signal: 'event',
    ...head(read),
    level,
    // The copy holds the same rules as the validated input, so it has the input's schema type.
    schema: copySchema(read.get('schema'), FIELD_KINDS) as S,
  })
}

/**
 * Declares one metric. Labels are enum or boolean only. Throws TypeError for an invalid
 * definition.
 */
export function defineMetric<const S extends LabelSchema>(
  input: Readonly<{
    owner: string
    name: string
    version: number
    unit: MetricDefinition<S>['unit']
    aggregation: MetricDefinition<S>['aggregation']
    schema: S
  }>,
): MetricDefinition<S> {
  const read = members(input, 'a metric definition')
  const unit = read.get('unit')
  if (!isOneOf(unit, UNITS)) return fail(`the unit ${String(unit)} is not known`)
  return Object.freeze({
    signal: 'metric',
    ...head(read),
    unit,
    aggregation: aggregation(read.get('aggregation')),
    // The copy holds the same rules as the validated input, so it has the input's schema type.
    schema: copySchema(read.get('schema'), LABEL_KINDS) as S,
  })
}

/** Declares one segment. Throws TypeError for an invalid definition. */
export function defineSegment(
  input: Readonly<{ owner: string; name: string; version: number }>,
): SegmentDefinition {
  return Object.freeze({ signal: 'segment', ...head(members(input, 'a segment definition')) })
}
