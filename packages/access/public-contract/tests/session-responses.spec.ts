import {
  encodeSessionResponse,
  readGovernanceResponse,
  readSessionResponse,
  type SessionOperation,
  type SessionResponse,
  type SessionResponseEncodeInput,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'

const limits = {
  maxBytes: 100_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const version = 'session-public/1'
const session = 'fedcba9876543210'.repeat(4)
const page = {
  entries: [
    {
      entryId: 'entry-1',
      revision: '7',
      kind: 'message.user',
      payload: { role: 'user', blocks: [{ type: 'text', text: 'hi' }], n: 1 },
    },
    { entryId: 'entry-2', revision: '8', kind: 'intake.routed', payload: null },
  ],
  next: 'cursor-2',
  exhausted: false,
  scannedThrough: '8',
}
const successes = {
  'create-session': { session, recovered: false },
  'query-create-session': { session },
  'send-input': { recovered: true },
  'query-send-input': {},
  'read-history': page,
} satisfies Record<SessionOperation, object>
const outcomes = {
  'create-session': ['succeeded', 'denied', 'invalid', 'conflict', 'basis-unavailable', 'unknown'],
  'query-create-session': ['succeeded', 'denied', 'basis-unavailable', 'unknown'],
  'send-input': [
    'succeeded',
    'denied',
    'invalid',
    'archived',
    'frozen',
    'conflict',
    'basis-unavailable',
    'unknown',
  ],
  'query-send-input': ['succeeded', 'not-committed', 'denied', 'basis-unavailable', 'unknown'],
  'read-history': ['succeeded', 'denied', 'invalid', 'basis-unavailable'],
} satisfies Record<SessionOperation, readonly string[]>
const allOutcomes = [
  'succeeded',
  'denied',
  'invalid',
  'archived',
  'frozen',
  'not-committed',
  'conflict',
  'basis-unavailable',
  'unknown',
  'no-change',
  'not-visible',
  'stage-not-provided',
]
const operations = Object.keys(outcomes) as SessionOperation[]
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const omit = (value: object, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
const wireOf = (outcome: string, body: unknown, messageId: string | null = 'm') => ({
  protocolVersion: version,
  ...(messageId === null ? {} : { messageId }),
  outcome,
  body,
})
const readWire = (operation: SessionOperation, wire: unknown, expectedMessageId = 'm') =>
  readSessionResponse({ bytes: bytes(wire), operation, expectedMessageId, limits })
const decode = (encoded: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(encoded))

describe.each(operations)('%s', operation => {
  it.each([...outcomes[operation]])('round trips the %s outcome', outcome => {
    const body = outcome === 'succeeded' ? successes[operation] : {}
    const wire = wireOf(outcome, body)
    const read = readWire(operation, wire)
    expect(read.kind).toBe('response')
    if (read.kind !== 'response') return
    expect(read.response.outcome).toBe(outcome)
    const encoded = encodeSessionResponse({
      operation,
      response: read.response,
      limits,
    } as SessionResponseEncodeInput)
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(decode(encoded.bytes)).toEqual(wire)
  })

  it.each(allOutcomes.filter(outcome => !outcomes[operation].some(known => known === outcome)))(
    'rejects the %s outcome that the operation does not have',
    outcome => {
      expect(readWire(operation, wireOf(outcome, {}))).toEqual({
        kind: 'unreadable',
        diagnostic: { code: 'field' },
      })
      expect(
        encodeSessionResponse({
          operation,
          response: wireOf(outcome, {}),
          limits,
        } as SessionResponseEncodeInput),
      ).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
    },
  )

  it('closes the success body and requires every success field', () => {
    const body: Record<string, unknown> = successes[operation]
    expect(readWire(operation, wireOf('succeeded', { ...body, extra: 'secret' })).kind).toBe(
      'unreadable',
    )
    for (const key of Object.keys(body)) {
      const missing = Object.fromEntries(Object.entries(body).filter(([name]) => name !== key))
      expect(readWire(operation, wireOf('succeeded', missing)).kind).toBe('unreadable')
    }
  })

  it('requires an explicit empty body and a messageId for non-success outcomes', () => {
    const failure = outcomes[operation].find(outcome => outcome !== 'succeeded') ?? 'denied'
    expect(readWire(operation, wireOf(failure, { reason: 'secret' })).kind).toBe('unreadable')
    expect(readWire(operation, omit(wireOf(failure, {}), 'body')).kind).toBe('unreadable')
    expect(readWire(operation, wireOf(failure, {}, null)).kind).toBe('unreadable')
  })

  it('accepts protocol-rejected with or without a messageId and matches only its own', () => {
    expect(readWire(operation, wireOf('protocol-rejected', {}))).toEqual({
      kind: 'response',
      response: wireOf('protocol-rejected', {}),
    })
    expect(readWire(operation, wireOf('protocol-rejected', {}, null))).toEqual({
      kind: 'unmatched',
    })
    expect(readWire(operation, wireOf('protocol-rejected', {}), 'other')).toEqual({
      kind: 'unmatched',
    })
  })

  it('reports a valid response with a different messageId as unmatched', () => {
    expect(readWire(operation, wireOf('succeeded', successes[operation]), 'other')).toEqual({
      kind: 'unmatched',
    })
  })
})

describe('session success body formats', () => {
  it.each([
    ['upper-case', session.toUpperCase()],
    ['short', session.slice(2)],
    ['empty', ''],
  ])('rejects a %s session in create and query-create successes', (_name, value) => {
    expect(
      readWire('create-session', wireOf('succeeded', { session: value, recovered: false })).kind,
    ).toBe('unreadable')
    expect(readWire('query-create-session', wireOf('succeeded', { session: value })).kind).toBe(
      'unreadable',
    )
  })

  it('rejects a non-boolean recovered', () => {
    expect(readWire('send-input', wireOf('succeeded', { recovered: 'true' })).kind).toBe(
      'unreadable',
    )
  })
})

describe('history page', () => {
  const history = (body: unknown) => readWire('read-history', wireOf('succeeded', body))

  it('reads an empty page that is not exhausted, with a null next', () => {
    const empty = { entries: [], next: null, exhausted: false, scannedThrough: '0' }
    expect(history(empty)).toEqual({ kind: 'response', response: wireOf('succeeded', empty) })
  })

  it('keeps payloads as json-text trees, including number lexemes and unknown kinds', () => {
    const raw = JSON.stringify(wireOf('succeeded', page)).replace('"n":1', '"n":1.000')
    const read = readSessionResponse({
      bytes: new TextEncoder().encode(raw),
      operation: 'read-history',
      expectedMessageId: 'm',
      limits,
    })
    if (read.kind !== 'response' || read.response.outcome !== 'succeeded')
      throw new Error('expected a history page')
    const [first, second] = read.response.body.entries
    expect(first?.payload).toEqual({
      kind: 'object',
      entries: [
        { key: 'role', value: { kind: 'string', value: 'user' } },
        {
          key: 'blocks',
          value: {
            kind: 'array',
            items: [
              {
                kind: 'object',
                entries: [
                  { key: 'type', value: { kind: 'string', value: 'text' } },
                  { key: 'text', value: { kind: 'string', value: 'hi' } },
                ],
              },
            ],
          },
        },
        { key: 'n', value: { kind: 'number', lexeme: '1.000' } },
      ],
    })
    expect(second).toEqual({
      entryId: 'entry-2',
      revision: '8',
      kind: 'intake.routed',
      payload: { kind: 'null' },
    })
    const encoded = encodeSessionResponse({
      operation: 'read-history',
      response: read.response,
      limits,
    })
    if (encoded.kind !== 'encoded') throw new Error('expected an encoded page')
    const written = new TextDecoder().decode(encoded.bytes)
    expect(written).toContain('"n":1.000')
    expect(JSON.parse(written)).toEqual(JSON.parse(raw))
  })

  it.each([
    ['an empty next', { ...page, next: '' }],
    ['a numeric next', { ...page, next: 2 }],
    ['an empty scannedThrough', { ...page, scannedThrough: '' }],
    ['a non-boolean exhausted', { ...page, exhausted: 'false' }],
    ['entries that are not an array', { ...page, entries: {} }],
    [
      'an entry without payload',
      { ...page, entries: [{ entryId: 'e', revision: '1', kind: 'k' }] },
    ],
    [
      'an entry with an extra field',
      { ...page, entries: [{ entryId: 'e', revision: '1', kind: 'k', payload: 1, x: 1 }] },
    ],
    [
      'an entry with an empty entryId',
      { ...page, entries: [{ entryId: '', revision: '1', kind: 'k', payload: 1 }] },
    ],
    [
      'an entry with an empty kind',
      { ...page, entries: [{ entryId: 'e', revision: '1', kind: '', payload: 1 }] },
    ],
  ])('rejects a page with %s', (_name, body) => {
    expect(history(body)).toEqual({ kind: 'unreadable', diagnostic: { code: 'field' } })
  })
})

describe('reading and encoding boundaries', () => {
  it('validates the whole response before matching the messageId', () => {
    for (const expectedMessageId of ['m', 'other'])
      expect(
        readWire(
          'send-input',
          wireOf('succeeded', { recovered: true, leak: 'x' }),
          expectedMessageId,
        ),
      ).toEqual({ kind: 'unreadable', diagnostic: { code: 'field' } })
  })

  it.each(['{', '{"messageId":"m","x":0,"x":1}', '{} trailing'])(
    'keeps malformed JSON %j unreadable',
    value => {
      expect(
        readSessionResponse({
          bytes: new TextEncoder().encode(value),
          operation: 'create-session',
          expectedMessageId: 'm',
          limits,
        }),
      ).toEqual({ kind: 'unreadable', diagnostic: { code: 'json' } })
    },
  )

  it('reports a budget overrun as budget', () => {
    expect(
      readSessionResponse({
        bytes: bytes(wireOf('succeeded', page)),
        operation: 'read-history',
        expectedMessageId: 'm',
        limits: { ...limits, maxDepth: 2 },
      }),
    ).toEqual({ kind: 'unreadable', diagnostic: { code: 'budget' } })
  })

  it('keeps the two protocol versions apart in response reading', () => {
    const governance = {
      protocolVersion: 'governance-public/1',
      messageId: 'm',
      outcome: 'protocol-rejected',
      body: {},
    }
    expect(readWire('create-session', governance)).toEqual({
      kind: 'unreadable',
      diagnostic: { code: 'field' },
    })
    expect(
      readGovernanceResponse({
        bytes: bytes(wireOf('protocol-rejected', {})),
        operation: 'public-health',
        expectedMessageId: 'm',
        limits,
      }),
    ).toEqual({ kind: 'unreadable', diagnostic: { code: 'field' } })
  })

  it('encodes only protocol-rejected through the common refusal overload', () => {
    const refusal = { protocolVersion: version, outcome: 'protocol-rejected', body: {} } as const
    const encoded = encodeSessionResponse({ response: refusal, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(decode(encoded.bytes)).toEqual(refusal)
    const refuse = (response: unknown) =>
      encodeSessionResponse({ response, limits } as Parameters<typeof encodeSessionResponse>[0])
    for (const response of [
      { protocolVersion: version, outcome: 'stage-not-provided', body: {} },
      { protocolVersion: version, messageId: 'm', outcome: 'succeeded', body: { recovered: true } },
      { protocolVersion: version, messageId: 'm', outcome: 'denied', body: {} },
      { protocolVersion: 'governance-public/1', outcome: 'protocol-rejected', body: {} },
    ])
      expect(refuse(response)).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
  })

  it('does not write the local operation into the wire response', () => {
    const response: SessionResponse<'send-input'> = {
      protocolVersion: version,
      messageId: 'm',
      outcome: 'frozen',
      body: {},
    }
    const encoded = encodeSessionResponse({ operation: 'send-input', response, limits })
    expect(encoded.kind === 'encoded' && decode(encoded.bytes)).toEqual(response)
  })

  it('throws the fixed session TypeError for an operation outside the session set', () => {
    for (const operation of ['public-health', 'disable-subject', 'toString'])
      expect(() =>
        readSessionResponse({
          bytes: bytes(wireOf('protocol-rejected', {})),
          operation: operation as SessionOperation,
          expectedMessageId: 'm',
          limits,
        }),
      ).toThrowError(
        expect.objectContaining({ name: 'TypeError', message: 'Invalid session codec arguments' }),
      )
    expect(() =>
      readSessionResponse({
        bytes: bytes(wireOf('protocol-rejected', {})),
        operation: 'create-session',
        expectedMessageId: 1 as unknown as string,
        limits,
      }),
    ).toThrowError(TypeError)
  })
})
