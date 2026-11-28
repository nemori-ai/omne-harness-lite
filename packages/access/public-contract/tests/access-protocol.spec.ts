import { describe, expect, it } from 'vitest'
import { readJsonText, type JsonLimits } from '@omne-harness/json-text'
import {
  accessProtocol,
  guestContract,
  guestContractData,
  guestContractOfTree,
} from '@omne-harness/public-contract'

const limits: JsonLimits = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 1_000,
  maxMembers: 100,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

describe('access/v1', () => {
  it('is named access, major 1, with one read for the acting tenant since revision 3 and only the availability observation', () => {
    expect([accessProtocol.name, accessProtocol.major]).toEqual(['access', 1])
    expect(Object.keys(accessProtocol.operations)).toEqual(['scoped'])
    expect(accessProtocol.operations.scoped).toMatchObject({
      identity: 'acting-tenant',
      effect: 'read',
      since: 3,
    })
    expect(Object.keys(accessProtocol.observations)).toEqual(['availability'])
  })

  it('needs no login and has no end reason of its own', () => {
    const { availability } = accessProtocol.observations
    expect(availability.identity).toBe('none')
    expect(availability.ends).toEqual([])
  })

  it('opens with an empty object and nothing else', () => {
    const { open } = accessProtocol.observations.availability
    expect(open.write({}, limits)).toEqual({ ok: true, value: { kind: 'object', entries: [] } })
    expect(open.read({ kind: 'object', entries: [] }, limits)).toEqual({ ok: true, value: {} })
    expect(open.write([] as never, limits).ok).toBe(false)
    expect(open.read({ kind: 'array', items: [] }, limits).ok).toBe(false)
  })
})

const KINDS =
  'text, string, boolean, null, account, organization, login, tenant, instant, plain-date, session, page-bytes, bytes, revision, positive-integer, count, page-limit, parameters, json, user-message, literal, object, array, one-of'

describe('a contract of a tenant written as data', () => {
  const text = { kind: 'text' } as const
  const data = {
    name: 'weather',
    major: 1,
    operations: {
      forecast: {
        effect: 'read',
        limit: 'small',
        body: { kind: 'object', fields: { city: { rule: text } } },
        result: text,
      },
      save: { effect: 'commit', limit: 'input', body: { kind: 'json' }, result: { kind: 'count' } },
    },
  } as const

  it('is made a contract whose every operation is for the acting tenant, and reads back to the same data', () => {
    const made = guestContract(data)
    if (!('ok' in made)) throw new Error(made.reason)
    expect(Object.values(made.ok.contract.operations).map(operation => operation.identity)).toEqual(
      ['acting-tenant', 'acting-tenant'],
    )
    expect(made.ok.contract.observations).toEqual({})
    expect(JSON.stringify(guestContractData(made.ok.contract))).toBe(JSON.stringify(data))
  })

  it("reaches a reader of scoped through the answer's tree as the same data, made with the same function (AC-10)", () => {
    const tree = readJsonText(JSON.stringify(data), limits)
    if (tree.kind !== 'ok') throw new Error('the data is not JSON')
    const body = { protocols: [{ name: 'weather', major: 1, contract: tree.value }] }
    const written = accessProtocol.operations.scoped.outcomes.succeeded.write(body, limits)
    if (!written.ok) throw new Error('the answer is not access/v1')
    const read = accessProtocol.operations.scoped.outcomes.succeeded.read(written.value, limits)
    if (!read.ok) throw new Error('the answer does not read back')
    const told = guestContractOfTree(read.value.protocols[0]!.contract)
    const made = guestContract(data)
    if (!('ok' in made)) throw new Error(made.reason)
    expect('ok' in told && told.ok.data).toEqual(made.ok.data)
  })

  it.each([
    ['not a record', 'x', 'a contract is { name, major, operations }'],
    ['no major', { name: 'w', operations: {} }, 'a contract is { name, major, operations }'],
    [
      'an effect that is neither',
      { ...data, operations: { a: { ...data.operations.forecast, effect: 'write' } } },
      'a: effect is read or commit',
    ],
    [
      'a limit that is neither',
      { ...data, operations: { a: { ...data.operations.forecast, limit: 'big' } } },
      'a: limit is small or input',
    ],
    [
      'a field of a kind there is not',
      {
        ...data,
        operations: {
          a: {
            ...data.operations.forecast,
            body: { kind: 'object', fields: { latitude: { rule: { kind: 'number' } } } },
          },
        },
      },
      `a: body.latitude: number is not a kind of rule; a rule is one of ${KINDS}`,
    ],
    [
      'a result of a kind there is not',
      { ...data, operations: { a: { ...data.operations.forecast, result: { kind: 'decimal' } } } },
      `a: result: decimal is not a kind of rule; a rule is one of ${KINDS}`,
    ],
    [
      'an object rule with no fields',
      { ...data, operations: { a: { ...data.operations.forecast, body: { kind: 'object' } } } },
      'a: body: an object rule has fields',
    ],
    [
      'an array rule with no item',
      { ...data, operations: { a: { ...data.operations.forecast, result: { kind: 'array' } } } },
      'a: result: an array rule has an item',
    ],
    ['a name that is not text', { ...data, name: 7 }, 'a contract is { name, major, operations }'],
    [
      'an operation that is not a record',
      { ...data, operations: { a: 'read' } },
      'a: an operation is { effect, limit, body, result }',
    ],
    [
      'a rule that is not a record',
      { ...data, operations: { a: { ...data.operations.forecast, body: 'text' } } },
      'a: body: a rule is { kind, … }',
    ],
    [
      'a rule whose kind is not text',
      { ...data, operations: { a: { ...data.operations.forecast, result: { kind: 1 } } } },
      'a: result: a rule is { kind, … }',
    ],
    [
      'a field that is not { rule }',
      {
        ...data,
        operations: {
          a: { ...data.operations.forecast, body: { kind: 'object', fields: { city: 'text' } } },
        },
      },
      'a: body.city: a field is { rule, optional?, since? }',
    ],
    [
      'a literal rule with no values',
      { ...data, operations: { a: { ...data.operations.forecast, result: { kind: 'literal' } } } },
      'a: result: a literal rule has values, each a string or a boolean',
    ],
    [
      'a literal rule with a number among its values',
      {
        ...data,
        operations: {
          a: { ...data.operations.forecast, result: { kind: 'literal', values: ['c', 1] } },
        },
      },
      'a: result: a literal rule has values, each a string or a boolean',
    ],
    [
      'an array rule whose item is of a kind there is not',
      {
        ...data,
        operations: {
          a: { ...data.operations.forecast, result: { kind: 'array', item: { kind: 'number' } } },
        },
      },
      `a: result[]: number is not a kind of rule; a rule is one of ${KINDS}`,
    ],
    [
      'a one-of rule with no rules',
      {
        ...data,
        operations: { a: { ...data.operations.forecast, result: { kind: 'one-of', rules: [] } } },
      },
      'a: result: a one-of rule has rules',
    ],
    [
      'a one-of rule with a rule of a kind there is not',
      {
        ...data,
        operations: {
          a: {
            ...data.operations.forecast,
            result: { kind: 'one-of', rules: [text, { kind: 'number' }] },
          },
        },
      },
      `a: result: number is not a kind of rule; a rule is one of ${KINDS}`,
    ],
  ])('answers the first fault and does not throw: %s', (_name, given, reason) => {
    expect(guestContract(given)).toEqual({ reason })
  })

  it('takes every kind of rule there is: a literal, an array, a one-of and nested objects', () => {
    const made = guestContract({
      ...data,
      operations: {
        forecast: {
          effect: 'read',
          limit: 'small',
          body: {
            kind: 'object',
            fields: {
              unit: { rule: { kind: 'literal', values: ['c', 'f', true] } },
              days: { rule: { kind: 'array', item: { kind: 'count' } }, optional: true },
            },
          },
          result: { kind: 'one-of', rules: [text, { kind: 'null' }] },
        },
      },
    })
    expect('ok' in made).toBe(true)
  })
})
