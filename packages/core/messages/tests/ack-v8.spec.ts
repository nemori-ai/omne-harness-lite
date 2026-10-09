import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  createModelCallSemanticDigest,
  judgeModelCallSemanticDigest,
  judgeModelInvocationRecord,
  judgeModelInvocationRecordText,
  judgeMessage,
  validate,
  type ModelCallSemanticDigestRole,
} from '@omne-harness-lite/messages'

const base = new URL('./fixtures/', import.meta.url)
function object(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    LosslessNumber.is(value)
  )
    throw new Error('object fixture required')
  return Object.fromEntries(Object.entries(value))
}
function role(value: unknown): ModelCallSemanticDigestRole {
  if (
    value !== 'model-call-creation-semantic-sha256/v1' &&
    value !== 'model-call-retained-result-semantic-sha256/v1'
  )
    throw new Error('invalid role fixture')
  return value
}
function readFixture(name: string): unknown {
  const parsed = readJsonStrict(readFileSync(new URL(name, base), 'utf8'))
  if ('failed' in parsed) throw new Error(`invalid ${name}`)
  return parsed.ok
}

describe('MS8 S56 owned semantic digest', () => {
  const fixture = object(readFixture('semantic-digest-vectors.json'))
  if (
    !Array.isArray(fixture.vectors) ||
    !Array.isArray(fixture.equalPairs) ||
    !Array.isArray(fixture.differentPairs)
  )
    throw new Error('missing digest vectors')
  const vectors = fixture.vectors.map(row => object(row))
  const byName = new Map(vectors.map(row => [row.name, row]))
  function result(row: Record<string, unknown>) {
    if (typeof row.json !== 'string' || typeof row.sha256 !== 'string')
      throw new Error('invalid vector')
    const parsed = readJsonStrict(row.json)
    if ('failed' in parsed) throw new Error('invalid vector JSON')
    return createModelCallSemanticDigest(role(row.role), parsed.ok)
  }
  function hex(row: Record<string, unknown>): string {
    const digest = result(row)
    if ('rejected' in digest) throw new Error('valid vector rejected')
    return digest.ok.hex
  }
  it('matches every one of 20 exact source vectors, including UTF-16 ordering and large exponents', () => {
    expect(vectors).toHaveLength(20)
    for (const row of vectors) {
      const actual = result(row)
      expect(actual).toEqual({ ok: { role: row.role, hex: row.sha256 } })
      if ('rejected' in actual) throw new Error('valid vector rejected')
      if (typeof row.json !== 'string') throw new Error('vector JSON missing')
      const parsed = readJsonStrict(row.json)
      if ('failed' in parsed) throw new Error('vector JSON changed')
      expect(judgeModelCallSemanticDigest(role(row.role), parsed.ok, actual.ok)).toEqual(actual)
      if (typeof row.canonicalAscii !== 'string') throw new Error('missing oracle bytes')
      expect(createHash('sha256').update(row.canonicalAscii).digest('hex')).toBe(row.sha256)
    }
  })
  it('preserves four equal-value and six distinct-value pairs', () => {
    expect(fixture.equalPairs).toHaveLength(4)
    expect(fixture.differentPairs).toHaveLength(6)
    const equalPairs = fixture.equalPairs
    const differentPairs = fixture.differentPairs
    if (!Array.isArray(equalPairs) || !Array.isArray(differentPairs))
      throw new Error('pairs missing')
    for (const [pairs, equal] of [
      [equalPairs, true],
      [differentPairs, false],
    ] as const) {
      for (const pair of pairs) {
        if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string')
          throw new Error('invalid pair')
        const left = byName.get(pair[0]),
          right = byName.get(pair[1])
        if (left === undefined || right === undefined) throw new Error('unknown vector name')
        if (equal) expect(hex(left)).toBe(hex(right))
        else expect(hex(left)).not.toBe(hex(right))
      }
    }
  })
  it('rejects getters and non-JSON values without invoking code or changing the caller value', () => {
    let getterCalls = 0
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        getterCalls++
        throw new Error('executed')
      },
    })
    const creation = role('model-call-creation-semantic-sha256/v1')
    for (const value of [
      accessor,
      { value: undefined },
      { value: Number.NaN },
      { value: Symbol('x') },
      { value: () => 1 },
    ])
      expect(createModelCallSemanticDigest(creation, value)).toEqual({ rejected: 'malformed' })
    expect(getterCalls).toBe(0)
    const ordinary = { value: [new LosslessNumber('9007199254740993'), -0] }
    const before = writeJsonLossless(ordinary)
    const digest = createModelCallSemanticDigest(creation, ordinary)
    expect('ok' in digest).toBe(true)
    expect(writeJsonLossless(ordinary)).toBe(before)
    if ('rejected' in digest) throw new Error('ordinary JSON rejected')
    expect(
      judgeModelCallSemanticDigest(
        'model-call-retained-result-semantic-sha256/v1',
        ordinary,
        digest.ok,
      ),
    ).toEqual({ rejected: 'malformed' })
    expect(judgeModelCallSemanticDigest(creation, ordinary, accessor)).toEqual({
      rejected: 'malformed',
    })
    expect(getterCalls).toBe(0)
  })
})

describe('MS8 S57–59 ACK record is a technical value', () => {
  const rows = readFixture('ack-examples.json')
  if (!Array.isArray(rows)) throw new Error('missing ACK rows')
  it('checks all normative ACK positive and negative shapes at both object and text boundaries', () => {
    expect(rows).toHaveLength(15)
    for (const raw of rows) {
      const row = object(raw)
      if (typeof row.name !== 'string' || typeof row.schemaValid !== 'boolean')
        throw new Error('bad ACK row')
      if (row.definition === 'Message') {
        expect(validate('Message', row.value).valid, row.name).toBe(row.schemaValid)
        expect(judgeMessage(row.value)).toEqual({ rejected: 'malformed' })
        continue
      }
      if (row.definition !== 'ModelInvocationRecord') throw new Error('unknown ACK definition')
      expect(validate('ModelInvocationRecord', row.value).valid, row.name).toBe(row.schemaValid)
      const judged = judgeModelInvocationRecord(row.value)
      expect('ok' in judged, row.name).toBe(row.schemaValid)
      expect(judgeModelInvocationRecordText(writeJsonLossless(row.value))).toEqual(judged)
      expect(judgeMessage(row.value)).toEqual({ rejected: 'malformed' })
    }
  })
  it('rejects witness response mismatch even when each member has valid shape', () => {
    const source = object(object(rows[0]).value)
    const witness = object(source.accountingWitness)
    const changed = { ...source, accountingWitness: { ...witness, response: 'another_response' } }
    expect(validate('ModelInvocationRecord', changed).valid).toBe(true)
    expect(judgeModelInvocationRecord(changed)).toEqual({ rejected: 'malformed' })
  })
})
