import { describe, expect, it } from 'vitest'
import { TELEMETRY_LIMITS, defineEvent, defineMetric, defineSegment } from '../src/index.ts'

const event = {
  owner: 'packages/session/session',
  name: 'omne.session.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    code: { kind: 'enum', values: ['timeout', 'refused'] },
    retried: { kind: 'boolean' },
    elapsed: { kind: 'number', min: 0, max: 3600 },
    session: { kind: 'ref', owner: 'packages/session/session', maxBytes: 64 },
  },
} as const

const metric = {
  owner: 'packages/model/model',
  name: 'omne.model.call.duration',
  version: 1,
  unit: 's',
  aggregation: { kind: 'histogram', boundaries: [0.1, 1, 10] },
  schema: { outcome: { kind: 'enum', values: ['ok', 'failure'] }, streamed: { kind: 'boolean' } },
} as const

const segment = { owner: 'packages/agent/agent', name: 'omne.agent.turn', version: 1 } as const

function longText(length: number): string {
  return 'a'.repeat(length)
}

/** Replaces one member of a valid input; the result is deliberately outside the declared types. */
function withMember(base: object, member: string, value: unknown): never {
  return { ...base, [member]: value } as never
}

describe('defineEvent', () => {
  it('returns a frozen event definition that keeps the declared schema', () => {
    const definition = defineEvent(event)

    expect(definition).toEqual({ signal: 'event', ...event })
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.schema)).toBe(true)
    expect(Object.isFrozen(definition.schema.code)).toBe(true)
  })

  it('does not follow later changes to the input object', () => {
    const schema = { code: { kind: 'enum', values: ['a'] } } as const
    const input = { ...event, schema: { ...schema } }
    const definition = defineEvent(input)

    ;(input.schema as Record<string, unknown>)['extra'] = { kind: 'boolean' }

    expect(Object.keys(definition.schema)).toEqual(['code'])
  })

  it('accepts names and owners at the length limits', () => {
    expect(() =>
      defineEvent({
        ...event,
        owner: longText(TELEMETRY_LIMITS.ownerMaxLength),
        name: longText(TELEMETRY_LIMITS.nameMaxLength),
      }),
    ).not.toThrow()
  })

  it.each([
    ['an empty owner', withMember(event, 'owner', '')],
    [
      'an owner over the length limit',
      withMember(event, 'owner', longText(TELEMETRY_LIMITS.ownerMaxLength + 1)),
    ],
    ['an owner with whitespace', withMember(event, 'owner', 'session owner')],
    ['a missing owner', withMember(event, 'owner', undefined)],
    ['an empty name', withMember(event, 'name', '')],
    [
      'a name over the length limit',
      withMember(event, 'name', longText(TELEMETRY_LIMITS.nameMaxLength + 1)),
    ],
    ['a name with a control character', withMember(event, 'name', 'omne\nsession')],
    ['a version of zero', withMember(event, 'version', 0)],
    ['a fractional version', withMember(event, 'version', 1.5)],
    ['an unknown level', withMember(event, 'level', 'fatal')],
    ['a schema that is not an object', withMember(event, 'schema', 'code')],
    ['a schema that is an array', withMember(event, 'schema', [])],
    ['an unknown rule kind', withMember(event, 'schema', { text: { kind: 'string' } })],
    ['an enum without values', withMember(event, 'schema', { code: { kind: 'enum', values: [] } })],
    [
      'an enum with a repeated value',
      withMember(event, 'schema', { code: { kind: 'enum', values: ['a', 'a'] } }),
    ],
    [
      'an enum value over the length limit',
      withMember(event, 'schema', {
        code: { kind: 'enum', values: [longText(TELEMETRY_LIMITS.enumValueMaxLength + 1)] },
      }),
    ],
    [
      'an enum with too many values',
      withMember(event, 'schema', {
        code: {
          kind: 'enum',
          values: Array.from(
            { length: TELEMETRY_LIMITS.maxEnumValues + 1 },
            (_, index) => `v${index}`,
          ),
        },
      }),
    ],
    [
      'a number rule with a minimum above the maximum',
      withMember(event, 'schema', { n: { kind: 'number', min: 2, max: 1 } }),
    ],
    [
      'a number rule with an infinite bound',
      withMember(event, 'schema', { n: { kind: 'number', min: 0, max: Infinity } }),
    ],
    [
      'a ref rule over the reference byte limit',
      withMember(event, 'schema', {
        r: { kind: 'ref', owner: 'x', maxBytes: TELEMETRY_LIMITS.refMaxBytes + 1 },
      }),
    ],
    [
      'a ref rule without an owner',
      withMember(event, 'schema', { r: { kind: 'ref', maxBytes: 8 } }),
    ],
    [
      'too many fields',
      withMember(
        event,
        'schema',
        Object.fromEntries(
          Array.from({ length: TELEMETRY_LIMITS.maxFields + 1 }, (_, index) => [
            `f${index}`,
            { kind: 'boolean' },
          ]),
        ),
      ),
    ],
    [
      'a field name over the length limit',
      withMember(event, 'schema', {
        [longText(TELEMETRY_LIMITS.nameMaxLength + 1)]: { kind: 'boolean' },
      }),
    ],
  ])('throws TypeError for %s', (_, input) => {
    expect(() => defineEvent(input)).toThrow(TypeError)
  })
})

describe('defineMetric', () => {
  it('returns a frozen metric definition', () => {
    const definition = defineMetric(metric)

    expect(definition).toEqual({ signal: 'metric', ...metric })
    expect(Object.isFrozen(definition.aggregation)).toBe(true)
  })

  it.each([
    ['a number label', withMember(metric, 'schema', { n: { kind: 'number', min: 0, max: 1 } })],
    ['a ref label', withMember(metric, 'schema', { r: { kind: 'ref', owner: 'x', maxBytes: 8 } })],
    ['an unknown unit', withMember(metric, 'unit', 'ms')],
    ['an unknown aggregation', withMember(metric, 'aggregation', { kind: 'summary' })],
    [
      'histogram boundaries that do not increase',
      withMember(metric, 'aggregation', { kind: 'histogram', boundaries: [1, 1] }),
    ],
    [
      'a histogram without boundaries',
      withMember(metric, 'aggregation', { kind: 'histogram', boundaries: [] }),
    ],
    [
      'too many histogram boundaries',
      withMember(metric, 'aggregation', {
        kind: 'histogram',
        boundaries: Array.from(
          { length: TELEMETRY_LIMITS.maxHistogramBoundaries + 1 },
          (_, i) => i,
        ),
      }),
    ],
    [
      'a non-finite histogram boundary',
      withMember(metric, 'aggregation', { kind: 'histogram', boundaries: [0, NaN] }),
    ],
    [
      'an owner over the length limit',
      withMember(metric, 'owner', longText(TELEMETRY_LIMITS.ownerMaxLength + 1)),
    ],
    [
      'a name over the length limit',
      withMember(metric, 'name', longText(TELEMETRY_LIMITS.nameMaxLength + 1)),
    ],
  ])('throws TypeError for %s', (_, input) => {
    expect(() => defineMetric(input)).toThrow(TypeError)
  })
})

describe('defineSegment', () => {
  it('returns a frozen segment definition', () => {
    const definition = defineSegment(segment)

    expect(definition).toEqual({ signal: 'segment', ...segment })
    expect(Object.isFrozen(definition)).toBe(true)
  })

  it.each([
    ['an empty owner', withMember(segment, 'owner', '')],
    [
      'an owner over the length limit',
      withMember(segment, 'owner', longText(TELEMETRY_LIMITS.ownerMaxLength + 1)),
    ],
    ['an empty name', withMember(segment, 'name', '')],
    [
      'a name over the length limit',
      withMember(segment, 'name', longText(TELEMETRY_LIMITS.nameMaxLength + 1)),
    ],
    ['a negative version', withMember(segment, 'version', -1)],
    ['an input that is not an object', null as never],
  ])('throws TypeError for %s', (_, input) => {
    expect(() => defineSegment(input)).toThrow(TypeError)
  })
})

describe('TELEMETRY_LIMITS', () => {
  it('holds the structural limits of the contract and cannot be changed', () => {
    expect(TELEMETRY_LIMITS).toEqual({
      componentMaxLength: 64,
      nameMaxLength: 128,
      ownerMaxLength: 128,
      refMaxBytes: 256,
      maxLinks: 8,
      maxAdopted: 8,
      maxFields: 32,
      maxEnumValues: 64,
      enumValueMaxLength: 64,
      maxHistogramBoundaries: 32,
    })
    expect(Object.isFrozen(TELEMETRY_LIMITS)).toBe(true)
  })
})
