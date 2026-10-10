import { describe, expect, it } from 'vitest'
import { LosslessNumber, jsonNumberSource } from '@omne-harness-lite/content-blocks'
import { checkAppendRequest, checkLogPayload } from '@omne-harness-lite/session-log'

function entry() {
  return {
    tenant: { organization: 'org-a', account: 'account-a' },
    readKeys: ['read-a'],
    payload: { opaque: ['original'] },
  }
}

function request() {
  return {
    session: 'session-a',
    entries: [entry()],
    fence: { kind: 'unfenced' },
    condition: { kind: 'unconditional' },
  }
}

function message() {
  return {
    owner: 'messages',
    version: '9',
    kind: 'message',
    value: { id: 'message-a', type: 'user', createdAt: '2026-10-07T00:00:00Z', blocks: [] },
  }
}

const invalid = { failure: 'invalidInput' }

describe('checkAppendRequest public representation boundary', () => {
  it('owns the ordered unkeyed batch without sharing mutable caller data', () => {
    const first = entry()
    const second = { ...entry(), readKeys: [], payload: { opaque: ['second'] } }
    const input = { ...request(), entries: [first, second] }
    const checked = checkAppendRequest(input)
    if ('failure' in checked) throw new Error('legal request rejected')
    const [ownedFirst, ownedSecond] = checked.ok.entries
    expect(ownedFirst).not.toBe(first)
    expect(ownedSecond).not.toBe(second)
    expect(ownedFirst?.tenant).not.toBe(first.tenant)
    expect(ownedFirst?.readKeys).not.toBe(first.readKeys)
    expect(ownedFirst?.payload).not.toBe(first.payload)
    expect(checked.ok.fence).not.toBe(input.fence)
    expect(checked.ok.condition).not.toBe(input.condition)
    for (const value of [
      checked.ok,
      checked.ok.entries,
      ownedFirst,
      ownedFirst?.tenant,
      ownedFirst?.readKeys,
      ownedFirst?.payload,
      ownedSecond,
      checked.ok.fence,
      checked.ok.condition,
    ])
      expect(Object.isFrozen(value)).toBe(true)
    expect(ownedFirst?.payload).toHaveProperty('opaque')
    if (
      typeof ownedFirst?.payload !== 'object' ||
      ownedFirst.payload === null ||
      !('opaque' in ownedFirst.payload)
    )
      throw new Error('opaque payload missing')
    expect(Object.isFrozen(ownedFirst.payload.opaque)).toBe(true)
    expect(ownedFirst.payload.opaque).not.toBe(first.payload.opaque)
    first.tenant.account = 'changed'
    first.readKeys.push('later')
    first.payload.opaque[0] = 'changed'
    second.payload.opaque.push('later')
    input.entries.reverse()
    input.fence.kind = 'changed'
    input.condition.kind = 'changed'
    expect(checked).toEqual({
      ok: {
        session: 'session-a',
        entries: [
          {
            tenant: { organization: 'org-a', account: 'account-a' },
            readKeys: ['read-a'],
            payload: { opaque: ['original'] },
          },
          {
            tenant: { organization: 'org-a', account: 'account-a' },
            readKeys: [],
            payload: { opaque: ['second'] },
          },
        ],
        fence: { kind: 'unfenced' },
        condition: { kind: 'unconditional' },
      },
    })
  })

  it('preserves fenced coordinates and exact numeric source text', () => {
    const checked = checkAppendRequest({
      ...request(),
      entries: [
        {
          ...entry(),
          run: 'run-a',
          attempt: new LosslessNumber('100000000000000000001'),
          dedupeKey: 'dedupe-a',
        },
      ],
      fence: {
        kind: 'fenced',
        run: 'run-a',
        attempt: new LosslessNumber('100000000000000000001.0'),
      },
      condition: { kind: 'tailEquals', tail: new LosslessNumber('100000000000000000002e0') },
    })
    expect(checked).toEqual({
      ok: {
        session: 'session-a',
        entries: [
          {
            tenant: { organization: 'org-a', account: 'account-a' },
            readKeys: ['read-a'],
            payload: { opaque: ['original'] },
            run: 'run-a',
            attempt: new LosslessNumber('100000000000000000001'),
            dedupeKey: 'dedupe-a',
          },
        ],
        fence: {
          kind: 'fenced',
          run: 'run-a',
          attempt: new LosslessNumber('100000000000000000001.0'),
        },
        condition: { kind: 'tailEquals', tail: new LosslessNumber('100000000000000000002e0') },
      },
    })
    if (
      'failure' in checked ||
      checked.ok.fence.kind !== 'fenced' ||
      checked.ok.condition.kind !== 'tailEquals'
    )
      throw new Error('fenced request rejected')
    const attempt = checked.ok.entries[0]?.attempt
    if (attempt === undefined) throw new Error('entry attempt missing')
    expect(jsonNumberSource(attempt)).toBe('100000000000000000001')
    expect(jsonNumberSource(checked.ok.fence.attempt)).toBe('100000000000000000001.0')
    expect(jsonNumberSource(checked.ok.condition.tail)).toBe('100000000000000000002e0')
  })

  it.each([
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
    { name: 'boolean', value: false },
    { name: 'string', value: 'session-a' },
    { name: 'number', value: 1 },
    { name: 'bigint', value: 1n },
    { name: 'symbol', value: Symbol('request') },
    { name: 'function', value: () => request() },
    { name: 'array', value: [] },
    { name: 'extra root field', value: { ...request(), position: 1 } },
    { name: 'empty batch', value: { ...request(), entries: [] } },
    { name: 'invalid tenant', value: { ...request(), entries: [{ ...entry(), tenant: {} }] } },
    {
      name: 'mixed tenants',
      value: {
        ...request(),
        entries: [entry(), { ...entry(), tenant: { organization: 'org-b', account: 'account-a' } }],
      },
    },
    {
      name: 'duplicate dedupe keys',
      value: {
        ...request(),
        entries: [
          { ...entry(), dedupeKey: 'same' },
          { ...entry(), dedupeKey: 'same' },
        ],
      },
    },
    {
      name: 'duplicate read keys',
      value: { ...request(), entries: [{ ...entry(), readKeys: ['same', 'same'] }] },
    },
    { name: 'unpaired run', value: { ...request(), entries: [{ ...entry(), run: 'run-a' }] } },
    {
      name: 'extra fence field',
      value: { ...request(), fence: { kind: 'unfenced', extra: true } },
    },
    {
      name: 'mismatched fence attempt',
      value: {
        ...request(),
        entries: [{ ...entry(), run: 'run-a', attempt: 1 }],
        fence: { kind: 'fenced', run: 'run-a', attempt: 2 },
      },
    },
    {
      name: 'extra condition field',
      value: { ...request(), condition: { kind: 'unconditional', extra: true } },
    },
    { name: 'missing tail', value: { ...request(), condition: { kind: 'tailEquals' } } },
    { name: 'negative tail', value: { ...request(), condition: { kind: 'tailEquals', tail: -1 } } },
    {
      name: 'fractional tail',
      value: { ...request(), condition: { kind: 'tailEquals', tail: 0.5 } },
    },
    { name: 'string tail', value: { ...request(), condition: { kind: 'tailEquals', tail: '0' } } },
    {
      name: 'malformed message',
      value: { ...request(), entries: [{ ...entry(), payload: { ...message(), value: {} } }] },
    },
    {
      name: 'messages fact bypass',
      value: { ...request(), entries: [{ ...entry(), payload: { ...message(), kind: 'fact' } }] },
    },
  ])('rejects $name', ({ value }) => {
    expect(checkAppendRequest(value)).toEqual(invalid)
  })

  it.each(['session', 'entries', 'fence', 'condition'])('requires own %s data', field => {
    const input = request()
    Reflect.deleteProperty(input, field)
    expect(checkAppendRequest(input)).toEqual(invalid)
  })

  it.each(['session', 'entries', 'fence', 'condition', 'payload', 'tenant'])(
    'rejects a %s getter without calling or replacing it',
    field => {
      let calls = 0
      const item = entry()
      const input = { ...request(), entries: [item] }
      const target = field === 'payload' || field === 'tenant' ? item : input
      Object.defineProperty(target, field, {
        enumerable: true,
        configurable: true,
        get() {
          calls++
          throw new Error('getter executed')
        },
      })
      const before = Object.getOwnPropertyDescriptor(target, field)
      expect(checkAppendRequest(input)).toEqual(invalid)
      expect(calls).toBe(0)
      expect(Object.getOwnPropertyDescriptor(target, field)).toEqual(before)
    },
  )

  it('accepts null prototypes without modifying the caller objects', () => {
    const item = entry()
    const input = { ...request(), entries: [item] }
    for (const value of [input, item, item.tenant, item.payload, input.fence, input.condition])
      Object.setPrototypeOf(value, null)
    const before = Object.getOwnPropertyDescriptors(input)
    expect(checkAppendRequest(input)).toEqual({
      ok: {
        session: 'session-a',
        entries: [
          {
            tenant: { organization: 'org-a', account: 'account-a' },
            readKeys: ['read-a'],
            payload: { opaque: ['original'] },
          },
        ],
        fence: { kind: 'unfenced' },
        condition: { kind: 'unconditional' },
      },
    })
    expect(Object.getOwnPropertyDescriptors(input)).toEqual(before)
    for (const value of [input, item, item.tenant, item.payload, input.fence, input.condition])
      expect(Object.getPrototypeOf(value)).toBe(null)
    expect(Object.isFrozen(input)).toBe(false)
  })
})

describe('checkLogPayload explicit owner boundary', () => {
  it('validates, copies and freezes a complete message independently of its input', () => {
    const input = message()
    const checked = checkLogPayload(input)
    if ('failure' in checked || checked.kind !== 'message')
      throw new Error('legal message rejected')
    expect(checked.payload).not.toBe(input)
    expect(checked.payload.value).not.toBe(input.value)
    expect(checked.payload.value.blocks).not.toBe(input.value.blocks)
    for (const value of [checked.payload, checked.payload.value, checked.payload.value.blocks])
      expect(Object.isFrozen(value)).toBe(true)
    input.owner = 'changed'
    input.value.id = 'changed'
    input.value.blocks.length = 1
    expect(checked).toEqual({
      kind: 'message',
      payload: {
        owner: 'messages',
        version: '9',
        kind: 'message',
        value: { id: 'message-a', type: 'user', createdAt: '2026-10-07T00:00:00Z', blocks: [] },
      },
    })
  })

  it('preserves a future fact schema for its named owner and owns its nested data', () => {
    const input = {
      owner: 'future-owner',
      version: 'next-v100',
      kind: 'fact',
      value: { opaque: ['original'] },
    }
    const checked = checkLogPayload(input)
    if ('failure' in checked || checked.kind !== 'fact') throw new Error('legal fact rejected')
    expect(checked.payload).not.toBe(input)
    expect(checked.payload.value).not.toBe(input.value)
    const value = checked.payload.value
    if (typeof value !== 'object' || value === null || !('opaque' in value))
      throw new Error('fact body missing')
    expect(value.opaque).not.toBe(input.value.opaque)
    for (const owned of [checked.payload, value, value.opaque])
      expect(Object.isFrozen(owned)).toBe(true)
    input.version = 'changed'
    input.value.opaque.push('later')
    expect(checked).toEqual({
      kind: 'fact',
      payload: {
        owner: 'future-owner',
        version: 'next-v100',
        kind: 'fact',
        value: { opaque: ['original'] },
      },
    })
  })

  it('copies and freezes unowned JSON without promoting it to a fact', () => {
    const input = { nested: ['original'] }
    const checked = checkLogPayload(input)
    if ('failure' in checked || checked.kind !== 'other') throw new Error('plain JSON rejected')
    expect(checked.value).not.toBe(input)
    const value = checked.value
    if (typeof value !== 'object' || value === null || !('nested' in value))
      throw new Error('plain data missing')
    expect(value.nested).not.toBe(input.nested)
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.nested)).toBe(true)
    input.nested.push('later')
    expect(checked).toEqual({ kind: 'other', value: { nested: ['original'] } })
  })

  it.each([
    { name: 'null', value: null, expected: null },
    { name: 'false', value: false, expected: false },
    { name: 'zero', value: 0, expected: 0 },
    { name: 'empty string', value: '', expected: '' },
    { name: 'array', value: [null, false, 'item'], expected: [null, false, 'item'] },
  ])('preserves the complete $name fact value', ({ value, expected }) => {
    expect(
      checkLogPayload({ owner: 'other-owner', version: 'future', kind: 'fact', value }),
    ).toEqual({
      kind: 'fact',
      payload: { owner: 'other-owner', version: 'future', kind: 'fact', value: expected },
    })
  })

  it.each([
    { name: 'null', value: null, expected: null },
    { name: 'boolean', value: false, expected: false },
    { name: 'number', value: 0, expected: 0 },
    { name: 'string', value: '', expected: '' },
    { name: 'array', value: [{ owner: 'messages' }], expected: [{ owner: 'messages' }] },
    { name: 'empty object', value: {}, expected: {} },
    {
      name: 'unowned envelope fields',
      value: { version: '9', kind: 'message', value: null },
      expected: { version: '9', kind: 'message', value: null },
    },
    {
      name: 'bare message',
      value: message().value,
      expected: { id: 'message-a', type: 'user', createdAt: '2026-10-07T00:00:00Z', blocks: [] },
    },
  ])('retains $name as other JSON', ({ value, expected }) => {
    expect(checkLogPayload(value)).toEqual({ kind: 'other', value: expected })
  })

  it.each([
    { name: 'extra envelope field', value: { ...message(), extra: true } },
    { name: 'missing value', value: { owner: 'messages', version: '9', kind: 'message' } },
    {
      name: 'missing version',
      value: { owner: 'messages', kind: 'message', value: message().value },
    },
    { name: 'missing kind', value: { owner: 'messages', version: '9', value: message().value } },
    { name: 'empty owner', value: { ...message(), owner: '' } },
    { name: 'numeric owner', value: { ...message(), owner: 1 } },
    { name: 'null owner', value: { ...message(), owner: null } },
    { name: 'undefined own owner', value: { ...message(), owner: undefined } },
    { name: 'empty version', value: { ...message(), version: '' } },
    { name: 'numeric version', value: { ...message(), version: 9 } },
    { name: 'unknown kind', value: { ...message(), kind: 'other' } },
    { name: 'other message owner', value: { ...message(), owner: 'other-owner' } },
    { name: 'old message version', value: { ...message(), version: '8' } },
    { name: 'future message version', value: { ...message(), version: '10' } },
    { name: 'current messages fact', value: { ...message(), kind: 'fact' } },
    {
      name: 'future messages fact',
      value: { ...message(), version: 'future', kind: 'fact', value: null },
    },
    { name: 'invalid message body', value: { ...message(), value: {} } },
  ])('refuses $name without downgrading to other', ({ value }) => {
    expect(checkLogPayload(value)).toEqual(invalid)
  })

  it.each(['owner', 'version', 'kind', 'value', 'blocks'])(
    'rejects the %s getter without executing or replacing it',
    field => {
      let calls = 0
      const input = message()
      const target = field === 'blocks' ? input.value : input
      Object.defineProperty(target, field, {
        enumerable: true,
        configurable: true,
        get() {
          calls++
          throw new Error('getter executed')
        },
      })
      const before = Object.getOwnPropertyDescriptor(target, field)
      expect(checkLogPayload(input)).toEqual(invalid)
      expect(calls).toBe(0)
      expect(Object.getOwnPropertyDescriptor(target, field)).toEqual(before)
    },
  )

  it.each([
    {
      name: 'message',
      value: message(),
      expected: {
        kind: 'message',
        payload: {
          owner: 'messages',
          version: '9',
          kind: 'message',
          value: { id: 'message-a', type: 'user', createdAt: '2026-10-07T00:00:00Z', blocks: [] },
        },
      },
    },
    {
      name: 'fact',
      value: { owner: 'other-owner', version: 'future', kind: 'fact', value: null },
      expected: {
        kind: 'fact',
        payload: { owner: 'other-owner', version: 'future', kind: 'fact', value: null },
      },
    },
    {
      name: 'other',
      value: { opaque: [false] },
      expected: { kind: 'other', value: { opaque: [false] } },
    },
  ])('accepts a null-prototype $name without changing input descriptors', ({ value, expected }) => {
    Object.setPrototypeOf(value, null)
    const before = Object.getOwnPropertyDescriptors(value)
    expect(checkLogPayload(value)).toEqual(expected)
    expect(Object.getPrototypeOf(value)).toBe(null)
    expect(Object.getOwnPropertyDescriptors(value)).toEqual(before)
    expect(Object.isFrozen(value)).toBe(false)
  })
})

describe.each([
  {
    name: 'append request payload',
    check: (value: unknown) =>
      checkAppendRequest({ ...request(), entries: [{ ...entry(), payload: value }] }),
  },
  { name: 'log payload', check: checkLogPayload },
])('$name strict JSON boundary', ({ check }) => {
  it.each([
    { name: 'undefined', value: undefined },
    { name: 'nonfinite number', value: Number.POSITIVE_INFINITY },
    { name: 'hidden property', value: Object.defineProperty({}, 'hidden', { value: true }) },
    { name: 'symbol property', value: { [Symbol('hidden')]: true } },
    {
      name: 'inherited owner',
      value: Object.setPrototypeOf({ value: null }, { owner: 'messages' }),
    },
  ])('rejects $name', ({ value }) => {
    expect(check(value)).toEqual(invalid)
  })

  it('rejects a cycle without modifying its reference', () => {
    const input: { self?: unknown } = {}
    input.self = input
    expect(check(input)).toEqual(invalid)
    expect(input.self).toBe(input)
  })

  it('rejects toJSON without invoking or replacing caller code', () => {
    let calls = 0
    const input = {
      toJSON() {
        calls++
        return null
      },
    }
    const before = Object.getOwnPropertyDescriptor(input, 'toJSON')
    expect(check(input)).toEqual(invalid)
    expect(calls).toBe(0)
    expect(Object.getOwnPropertyDescriptor(input, 'toJSON')).toEqual(before)
  })
})
