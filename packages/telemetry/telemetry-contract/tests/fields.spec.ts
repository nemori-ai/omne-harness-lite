import { describe, expect, it } from 'vitest'
import { defineEvent, defineMetric, validateFields } from '../src/index.ts'

const definition = defineEvent({
  owner: 'packages/session/session',
  name: 'omne.session.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    code: { kind: 'enum', values: ['timeout', 'refused'] },
    retried: { kind: 'boolean' },
    elapsed: { kind: 'number', min: 0, max: 60 },
    session: { kind: 'ref', owner: 'packages/session/session', maxBytes: 16 },
  },
})

const valid = { code: 'timeout', retried: false, elapsed: 1.5, session: 'ses_01' }

/** Replaces one field; the result is deliberately outside the declared types. */
function withField(field: string, value: unknown): unknown {
  return { ...valid, [field]: value }
}

class Unserializable {
  toJSON(): string {
    return 'timeout'
  }
}

describe('validateFields', () => {
  it('accepts fields that match every rule', () => {
    expect(validateFields(definition, valid)).toEqual({ kind: 'ok' })
  })

  it('accepts the bounds of a number rule and a reference at the byte limit', () => {
    expect(validateFields(definition, withField('elapsed', 0))).toEqual({ kind: 'ok' })
    expect(validateFields(definition, withField('elapsed', 60))).toEqual({ kind: 'ok' })
    expect(validateFields(definition, withField('session', 'r'.repeat(16)))).toEqual({ kind: 'ok' })
  })

  it.each([
    ['an undeclared key', { ...valid, message: 'timeout' }, 'undeclared-key'],
    ['an undeclared symbol key', { ...valid, [Symbol('message')]: 'x' }, 'undeclared-key'],
    ['a missing key', { code: 'timeout', retried: false, elapsed: 1 }, 'missing-key'],
    ['NaN', withField('elapsed', NaN), 'not-finite'],
    ['Infinity', withField('elapsed', Infinity), 'not-finite'],
    ['a number below the minimum', withField('elapsed', -0.5), 'out-of-range'],
    ['a number above the maximum', withField('elapsed', 60.5), 'out-of-range'],
    ['a value outside the enum', withField('code', 'crashed'), 'not-in-enum'],
    ['a reference over the byte limit', withField('session', 'r'.repeat(17)), 'ref'],
    ['a reference with a space', withField('session', 'Bearer x'), 'ref'],
    ['a reference with a control character', withField('session', 'a\u0000b'), 'ref'],
    ['a non-ASCII reference', withField('session', 'sés'), 'ref'],
    ['an empty reference', withField('session', ''), 'ref'],
    ['an Error object', withField('code', new Error('timeout')), 'type'],
    ['a plain object', withField('code', { text: 'timeout' }), 'type'],
    ['an array', withField('code', ['timeout']), 'type'],
    ['an object with toJSON', withField('code', new Unserializable()), 'type'],
    ['a string for a boolean', withField('retried', 'false'), 'type'],
    ['a string for a number', withField('elapsed', '1'), 'type'],
    ['a bigint for a number', withField('elapsed', 1n), 'type'],
    ['null for a reference', withField('session', null), 'type'],
    ['fields that are not an object', 'timeout', 'not-object'],
    ['fields that are null', null, 'not-object'],
    ['fields that are an array', [], 'not-object'],
    ['fields that are an Error', new Error('timeout'), 'not-object'],
  ])('rejects %s', (_, fields, reason) => {
    expect(validateFields(definition, fields)).toEqual({ kind: 'invalid', reason })
  })

  it('rejects an accessor field without calling it', () => {
    let called = false
    const fields = { ...valid }
    Object.defineProperty(fields, 'code', {
      enumerable: true,
      get() {
        called = true
        return 'timeout'
      },
    })

    expect(validateFields(definition, fields)).toEqual({ kind: 'invalid', reason: 'type' })
    expect(called).toBe(false)
  })

  it('answers malformed instead of throwing when the fields object throws', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('trap')
        },
      },
    )

    expect(validateFields(definition, hostile)).toEqual({ kind: 'invalid', reason: 'malformed' })
  })

  it('answers definition for a hand-made definition with an unknown rule', () => {
    const forged = { schema: { code: { kind: 'text' } } } as never

    expect(validateFields(forged, { code: 'free text' })).toEqual({
      kind: 'invalid',
      reason: 'definition',
    })
  })

  describe('an optional field', () => {
    const diagnostic = defineEvent({
      owner: 'server-entry',
      name: 'omne.entry.diagnostic',
      version: 1,
      level: 'warn',
      schema: {
        code: { kind: 'enum', values: ['request.fault', 'identity.fault'] },
        path: { kind: 'ref', owner: 'server-entry', maxBytes: 16, optional: true },
        retried: { kind: 'boolean', optional: true },
      },
    })

    it('keeps the optional marker in the frozen copy of the definition', () => {
      expect(diagnostic.schema.path).toEqual({
        kind: 'ref',
        owner: 'server-entry',
        maxBytes: 16,
        optional: true,
      })
      expect(diagnostic.schema.retried).toEqual({ kind: 'boolean', optional: true })
      expect(diagnostic.schema.code).not.toHaveProperty('optional')
    })

    it('is valid when absent', () => {
      expect(validateFields(diagnostic, { code: 'request.fault' })).toEqual({ kind: 'ok' })
      expect(validateFields(diagnostic, { code: 'request.fault', path: '/a' })).toEqual({
        kind: 'ok',
      })
    })

    it.each([
      ['a reference over the byte limit', { code: 'request.fault', path: 'r'.repeat(17) }, 'ref'],
      ['an empty reference', { code: 'request.fault', path: '' }, 'ref'],
      ['a present key with undefined', { code: 'request.fault', path: undefined }, 'type'],
      ['a string for an optional boolean', { code: 'request.fault', retried: 'no' }, 'type'],
      ['a required key that is missing', { path: '/a' }, 'missing-key'],
    ])('is checked as usual when present: %s', (_, fields, reason) => {
      expect(validateFields(diagnostic, fields)).toEqual({ kind: 'invalid', reason })
    })

    it('rejects a definition whose optional marker is not true', () => {
      expect(() =>
        defineEvent({
          owner: 'server-entry',
          name: 'omne.entry.diagnostic',
          version: 1,
          level: 'warn',
          schema: { path: { kind: 'ref', owner: 'server-entry', maxBytes: 16, optional: false } },
        } as never),
      ).toThrow(TypeError)
    })

    it('applies to metric labels too', () => {
      const metric = defineMetric({
        owner: 'packages/model/model',
        name: 'omne.model.calls',
        version: 1,
        unit: '1',
        aggregation: { kind: 'counter' },
        schema: {
          outcome: { kind: 'enum', values: ['ok', 'failure'] },
          streamed: { kind: 'boolean', optional: true },
        },
      })

      expect(validateFields(metric, { outcome: 'ok' })).toEqual({ kind: 'ok' })
      expect(validateFields(metric, { outcome: 'ok', streamed: true })).toEqual({ kind: 'ok' })
      expect(validateFields(metric, { streamed: true })).toEqual({
        kind: 'invalid',
        reason: 'missing-key',
      })
    })
  })

  it('checks metric labels with the same rules', () => {
    const metric = defineMetric({
      owner: 'packages/model/model',
      name: 'omne.model.calls',
      version: 1,
      unit: '1',
      aggregation: { kind: 'counter' },
      schema: { outcome: { kind: 'enum', values: ['ok', 'failure'] } },
    })

    expect(validateFields(metric, { outcome: 'ok' })).toEqual({ kind: 'ok' })
    expect(validateFields(metric, { outcome: 'ok', model: 'x' })).toEqual({
      kind: 'invalid',
      reason: 'undeclared-key',
    })
  })
})
