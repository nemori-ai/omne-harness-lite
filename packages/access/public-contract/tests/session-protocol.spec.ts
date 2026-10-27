import { createSessionRequest, createSessionResponse } from './fixtures/client.ts'
import { receiveSession } from './fixtures/server.ts'
import {
  encodeSessionRequest,
  readGovernanceRequest,
  readSessionRequest,
  type SessionCodecLimits,
  type SessionRequest,
} from '@omne-harness/public-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'

const limits: SessionCodecLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const version = 'session-public/1'
const tenantText = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
const parsedTenant = tenantCodec.parse(tenantText)
if (!parsedTenant.ok) throw new Error('invalid test tenant')
const tenant = parsedTenant.value
const session = '0123456789abcdef'.repeat(4)
const userMessage = {
  role: 'user',
  blocks: [{ type: 'text', text: 'hello' }],
  weight: 1,
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const omit = (value: object, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
const text = (value: string) => new TextEncoder().encode(value)
const read = (value: unknown) => readSessionRequest({ bytes: bytes(value), limits })

const wires = {
  'create-session': {
    protocolVersion: version,
    messageId: 'm',
    operation: 'create-session',
    loginProof: 'proof',
    actingTenant: tenantText,
    body: { createCallId: 'call', definition: 'default', purpose: '' },
  },
  'query-create-session': {
    protocolVersion: version,
    messageId: 'm',
    operation: 'query-create-session',
    loginProof: 'proof',
    body: { tenant: tenantText, createCallId: 'call' },
  },
  'send-input': {
    protocolVersion: version,
    messageId: 'm',
    operation: 'send-input',
    loginProof: 'proof',
    body: {
      tenant: tenantText,
      session,
      acceptId: 'accept',
      inputId: 'input',
      message: userMessage,
    },
  },
  'query-send-input': {
    protocolVersion: version,
    messageId: 'm',
    operation: 'query-send-input',
    loginProof: 'proof',
    body: { tenant: tenantText, session, acceptId: 'accept' },
  },
  'read-history': {
    protocolVersion: version,
    messageId: 'm',
    operation: 'read-history',
    loginProof: 'proof',
    body: { tenant: tenantText, session, cursor: null, direction: 'backward', pageBytes: '65536' },
  },
} as const
const operations = Object.keys(wires) as (keyof typeof wires)[]
const nextPage = {
  ...wires['read-history'],
  body: { tenant: tenantText, session, cursor: 'opaque-cursor' },
}
const withBody = (operation: keyof typeof wires, body: Record<string, unknown>) => ({
  ...wires[operation],
  body: { ...wires[operation].body, ...body },
})
const withoutBodyField = (operation: keyof typeof wires, field: string) => ({
  ...wires[operation],
  body: omit(wires[operation].body, field),
})

function expectRejected(wire: unknown, code: 'json' | 'version' | 'operation' | 'field') {
  const result = read(wire)
  expect(result).toMatchObject({
    kind: 'protocol-rejected',
    response: { protocolVersion: version, outcome: 'protocol-rejected', body: {} },
    diagnostic: { code },
  })
  return result
}

describe('accepted session requests', () => {
  it.each([...Object.entries(wires), ['read-history next page', nextPage]] as const)(
    '%s reads to a typed request and re-encodes to the same wire',
    (_name, wire) => {
      const result = read(wire)
      expect(result.kind).toBe('request')
      if (result.kind !== 'request') return
      expect(result.request.operation).toBe(wire.operation)
      expect(result.request.proof).toEqual({ kind: 'present', value: 'proof' })
      const encoded = encodeSessionRequest({ request: result.request, limits })
      expect(encoded.kind).toBe('encoded')
      if (encoded.kind === 'encoded')
        expect(JSON.parse(new TextDecoder().decode(encoded.bytes))).toEqual(wire)
    },
  )

  it('reads tenants as full TenantId values and keeps session and pageBytes as text', () => {
    const create = read(wires['create-session'])
    if (create.kind !== 'request' || create.request.operation !== 'create-session')
      throw new Error('expected create-session')
    expect(tenantCodec.encode(create.request.actingTenant)).toEqual({ ok: true, value: tenantText })
    const history = read(wires['read-history'])
    if (history.kind !== 'request' || history.request.operation !== 'read-history')
      throw new Error('expected read-history')
    expect(tenantCodec.encode(history.request.body.tenant)).toEqual({ ok: true, value: tenantText })
    expect(history.request.body).toMatchObject({ session, cursor: null, pageBytes: '65536' })
  })

  it('keeps the user message as a json-text tree with number lexemes intact', () => {
    const raw = JSON.stringify(wires['send-input']).replace('"weight":1', '"weight":1.50')
    const result = readSessionRequest({ bytes: text(raw), limits })
    if (result.kind !== 'request' || result.request.operation !== 'send-input')
      throw new Error('expected send-input')
    expect(result.request.body.message.entries).toContainEqual({
      key: 'weight',
      value: { kind: 'number', lexeme: '1.50' },
    })
    const encoded = encodeSessionRequest({ request: result.request, limits })
    expect(encoded.kind === 'encoded' && new TextDecoder().decode(encoded.bytes)).toContain(
      '"weight":1.50',
    )
  })

  it.each(
    operations.flatMap(operation => [
      [operation, 'missing'] as const,
      [operation, 'empty'] as const,
    ]),
  )('%s keeps a %s loginProof for identity', (operation, proof) => {
    const wire = omit(wires[operation], 'loginProof')
    const result = read(proof === 'missing' ? wire : { ...wire, loginProof: '' })
    expect(result.kind).toBe('request')
    if (result.kind === 'request') expect(result.request.proof).toEqual({ kind: proof })
  })

  it.each(['1', '9', '10', '1048576'])('accepts pageBytes %s', pageBytes => {
    expect(read(withBody('read-history', { pageBytes })).kind).toBe('request')
  })

  it.each(['forward', 'backward'])('accepts direction %s', direction => {
    expect(read(withBody('read-history', { direction })).kind).toBe('request')
  })
})

describe('step 1 rejections', () => {
  it.each(['{', '{"messageId":"m"} trailing', '[1,]', '﻿{}', ''])(
    'rejects non-strict JSON %j',
    value => {
      const result = readSessionRequest({ bytes: text(value), limits })
      expect(result).toMatchObject({
        kind: 'protocol-rejected',
        response: { protocolVersion: version, outcome: 'protocol-rejected' },
        diagnostic: { code: 'json' },
      })
    },
  )

  it('rejects a duplicate protocolVersion but keeps the single trusted messageId', () => {
    const result = readSessionRequest({
      bytes: text(
        '{"protocolVersion":"session-public/1","protocolVersion":"session-public/1","messageId":"trusted"}',
      ),
      limits,
    })
    expect(result).toEqual({
      kind: 'protocol-rejected',
      response: {
        protocolVersion: version,
        messageId: 'trusted',
        outcome: 'protocol-rejected',
        body: {},
      },
      diagnostic: { code: 'json' },
    })
  })

  it('reports a byte budget overrun as budget', () => {
    expect(
      readSessionRequest({
        bytes: bytes(wires['create-session']),
        limits: { ...limits, maxBytes: 8 },
      }),
    ).toMatchObject({ kind: 'protocol-rejected', diagnostic: { code: 'budget' } })
  })

  it.each([
    [
      'another session version',
      { ...wires['create-session'], protocolVersion: 'session-public/2' },
    ],
    [
      'the governance version',
      { ...wires['create-session'], protocolVersion: 'governance-public/1' },
    ],
    ['a missing version', omit(wires['create-session'], 'protocolVersion')],
    ['a non-object root', [wires['create-session']]],
  ])('rejects %s with a version diagnostic', (_name, wire) => {
    const result = expectRejected(wire, 'version')
    if (!Array.isArray(wire)) expect(result).toMatchObject({ response: { messageId: 'm' } })
  })

  it.each([
    'create-organization',
    'public-health',
    'disable-subject',
    'toString',
    '__proto__',
    'CREATE-SESSION',
  ])('rejects operation %s in the session position', operation => {
    expectRejected({ ...wires['create-session'], operation }, 'operation')
  })

  it.each([
    ['an unknown envelope field', { ...wires['query-create-session'], extra: true }],
    ['actingTenant outside create-session', { ...wires['send-input'], actingTenant: tenantText }],
    ['create-session without actingTenant', omit(wires['create-session'], 'actingTenant')],
    ['an invalid actingTenant', { ...wires['create-session'], actingTenant: 'tenant' }],
    ['a missing messageId', omit(wires['query-send-input'], 'messageId')],
    ['a non-string messageId', { ...wires['query-send-input'], messageId: 1 }],
    ['a non-string loginProof', { ...wires['query-send-input'], loginProof: { secret: true } }],
    ['a missing body', omit(wires['query-send-input'], 'body')],
    ['a null body', { ...wires['query-send-input'], body: null }],
  ])('rejects %s', (_name, wire) => {
    expectRejected(wire, 'field')
  })

  it.each([
    ['create-session', { extra: 'x' }],
    ['create-session', { createCallId: '' }],
    ['create-session', { definition: '' }],
    ['create-session', { purpose: 1 }],
    ['create-session', { tenant: tenantText }],
    ['query-create-session', { createCallId: 1 }],
    ['send-input', { acceptId: '' }],
    ['send-input', { inputId: null }],
    ['query-send-input', { acceptId: ['accept'] }],
    ['read-history', { extra: true }],
  ] as const)('rejects a closed or mistyped %s body %j', (operation, body) => {
    expectRejected(withBody(operation, body), 'field')
  })

  it.each([
    ...operations.flatMap(operation =>
      Object.keys(wires[operation].body).map(field => [operation, field] as const),
    ),
    ...Object.keys(nextPage.body).map(field => ['read-history next page', field] as const),
  ])('rejects %s without its body field %s', (operation, field) => {
    const wire = operation === 'read-history next page' ? nextPage : wires[operation]
    expectRejected({ ...wire, body: omit(wire.body, field) }, 'field')
  })

  it.each(operations.filter(operation => operation !== 'create-session'))(
    'rejects actingTenant on %s',
    operation => {
      expectRejected({ ...wires[operation], actingTenant: tenantText }, 'field')
    },
  )

  it.each([
    'tenant',
    '',
    JSON.stringify({ organization: 'org_00000000000000000000000000' }),
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: 'acc_00000000000000000000000000',
      extra: 1,
    }),
    '{"organization":"org_00000000000000000000000000","organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}',
  ])('rejects the inner tenant text %j', value => {
    expectRejected(withBody('query-create-session', { tenant: value }), 'field')
  })

  it.each([
    ['upper case', session.toUpperCase()],
    ['63 characters', session.slice(1)],
    ['65 characters', `${session}0`],
    ['a non-hex character', `g${session.slice(1)}`],
    ['a trailing newline', `${session}\n`],
    ['an empty string', ''],
    ['a number', 1],
  ])('rejects a session text with %s', (_name, value) => {
    for (const operation of ['send-input', 'query-send-input', 'read-history'] as const)
      expectRejected(withBody(operation, { session: value }), 'field')
  })

  it.each([
    ['an assistant role', { ...userMessage, role: 'assistant' }],
    ['a missing role', { blocks: [] }],
    ['a non-string role', { role: ['user'] }],
    ['an upper-case role', { role: 'User' }],
    ['user only as the value of another key', { role: 'assistant', content: 'user' }],
    ['an array', [userMessage]],
    ['a string', 'hello'],
    ['null', null],
  ])('rejects a message with %s', (_name, message) => {
    expectRejected(withBody('send-input', { message }), 'field')
  })

  it.each(['0', '01', '-1', '1.5', '1e3', ' 1', '1 ', '', '１'])(
    'rejects pageBytes text %j',
    pageBytes => {
      expectRejected(withBody('read-history', { pageBytes }), 'field')
    },
  )

  it('rejects pageBytes given as a JSON number', () => {
    expectRejected(withBody('read-history', { pageBytes: 65536 }), 'field')
  })

  it.each([
    ['a missing cursor key', withoutBodyField('read-history', 'cursor')],
    ['an empty cursor', { ...nextPage, body: { ...nextPage.body, cursor: '' } }],
    ['a non-string cursor', { ...nextPage, body: { ...nextPage.body, cursor: 1 } }],
    [
      'direction beside a string cursor',
      { ...nextPage, body: { ...nextPage.body, direction: 'forward' } },
    ],
    [
      'pageBytes beside a string cursor',
      { ...nextPage, body: { ...nextPage.body, pageBytes: '1' } },
    ],
    ['a null cursor without direction', withoutBodyField('read-history', 'direction')],
    ['a null cursor without pageBytes', withoutBodyField('read-history', 'pageBytes')],
    ['an unknown direction', withBody('read-history', { direction: 'sideways' })],
  ])('rejects read-history with %s', (_name, wire) => {
    expectRejected(wire, 'field')
  })

  it('keeps rejected values out of the result', () => {
    const result = read({ ...wires['send-input'], loginProof: 'secret-proof', extra: 'secret' })
    expect(result.kind).toBe('protocol-rejected')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})

describe('cross-version positions', () => {
  it('rejects a governance message in the session position', () => {
    const governance = {
      protocolVersion: 'governance-public/1',
      messageId: 'm',
      operation: 'public-health',
      body: {},
    }
    expect(read(governance)).toEqual({
      kind: 'protocol-rejected',
      response: {
        protocolVersion: version,
        messageId: 'm',
        outcome: 'protocol-rejected',
        body: {},
      },
      diagnostic: { code: 'version' },
    })
  })

  it('rejects a session message in the governance position', () => {
    expect(readGovernanceRequest({ bytes: bytes(wires['create-session']), limits })).toEqual({
      kind: 'protocol-rejected',
      response: {
        protocolVersion: 'governance-public/1',
        messageId: 'm',
        outcome: 'protocol-rejected',
        body: {},
      },
      diagnostic: { code: 'version' },
    })
  })
})

describe('session request encoding', () => {
  const request: SessionRequest<'query-send-input'> = {
    protocolVersion: version,
    messageId: 'm',
    operation: 'query-send-input',
    proof: { kind: 'present', value: 'proof' },
    body: { tenant, session, acceptId: 'accept' },
  }
  const encode = (value: unknown) =>
    encodeSessionRequest({ request: value as SessionRequest, limits })

  it.each([
    ['the governance version', { ...request, protocolVersion: 'governance-public/1' }],
    ['a governance operation', { ...request, operation: 'public-health' }],
    ['a forged tenant', { ...request, body: { ...request.body, tenant: tenantText } }],
    ['a bad session', { ...request, body: { ...request.body, session: session.toUpperCase() } }],
    ['actingTenant outside create-session', { ...request, actingTenant: tenant }],
    ['a missing proof', omit(request, 'proof')],
    ['an empty present proof', { ...request, proof: { kind: 'present', value: '' } }],
  ])('returns invalid for %s', (_name, model) => {
    expect(encode(model)).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
  })

  it('encodes a cursor page request without direction or pageBytes', () => {
    const encoded = encodeSessionRequest({
      request: {
        protocolVersion: version,
        messageId: 'm',
        operation: 'read-history',
        proof: { kind: 'missing' },
        body: { tenant, session, cursor: 'opaque' },
      },
      limits,
    })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded')
      expect(JSON.parse(new TextDecoder().decode(encoded.bytes)).body).toEqual({
        tenant: tenantText,
        session,
        cursor: 'opaque',
      })
  })

  it('rejects mixed read-history shapes on encode', () => {
    for (const body of [
      { tenant, session, cursor: 'opaque', direction: 'forward' },
      { tenant, session, cursor: null, direction: 'forward' },
      { tenant, session, cursor: null, direction: 'forward', pageBytes: '0' },
    ])
      expect(encode({ ...request, operation: 'read-history', body })).toEqual({
        kind: 'invalid',
        diagnostic: { code: 'field' },
      })
  })

  it.each([
    [
      'a numeric pageBytes',
      { tenant, session, cursor: null, direction: 'forward', pageBytes: 4096 },
    ],
    [
      'a string cursor with first-page fields',
      { tenant, session, cursor: 'x', direction: 'forward', pageBytes: '10' },
    ],
  ])('returns invalid for read-history with %s', (_name, body) => {
    expect(encode({ ...request, operation: 'read-history', body })).toEqual({
      kind: 'invalid',
      diagnostic: { code: 'field' },
    })
  })

  it('returns invalid for an operation given as an array', () => {
    expect(encode({ ...request, operation: ['query-send-input'] })).toEqual({
      kind: 'invalid',
      diagnostic: { code: 'field' },
    })
  })

  it('rejects a message tree whose role is not user, and never calls getters', () => {
    let calls = 0
    const hostile = Object.defineProperty({ kind: 'object' }, 'entries', {
      enumerable: true,
      get() {
        calls++
        return []
      },
    })
    const base = {
      protocolVersion: version,
      messageId: 'm',
      operation: 'send-input',
      proof: { kind: 'present', value: 'proof' },
    }
    const body = { tenant, session, acceptId: 'a', inputId: 'i' }
    const assistant = {
      kind: 'object',
      entries: [{ key: 'role', value: { kind: 'string', value: 'assistant' } }],
    }
    expect(encode({ ...base, body: { ...body, message: assistant } }).kind).toBe('invalid')
    expect(encode({ ...base, body: { ...body, message: hostile } }).kind).toBe('invalid')
    expect(calls).toBe(0)
  })

  it('throws the fixed session TypeError for programming errors', () => {
    const error = expect.objectContaining({
      name: 'TypeError',
      message: 'Invalid session codec arguments',
    })
    for (const maxItems of [0, 1.5, Number.NaN])
      expect(() => encodeSessionRequest({ request, limits: { ...limits, maxItems } })).toThrowError(
        error,
      )
    expect(() =>
      readSessionRequest({ bytes: new Uint16Array(4) as unknown as Uint8Array, limits }),
    ).toThrowError(error)
    expect(() =>
      readSessionRequest({ bytes: bytes({}), limits, extra: true } as Parameters<
        typeof readSessionRequest
      >[0]),
    ).toThrowError(error)
  })
})

it('demonstrates independent client and server consumption of the session protocol', () => {
  const request = createSessionRequest('demo-session', tenant, limits)
  expect(request.kind).toBe('encoded')
  if (request.kind !== 'encoded') return
  const received = receiveSession(request.bytes, limits)
  expect(received.kind).toBe('requires-business-owner')
  if (received.kind === 'requires-business-owner')
    expect(received.request.operation).toBe('create-session')
  const refused = receiveSession(
    bytes({ protocolVersion: 'governance-public/1', messageId: 'demo-session' }),
    limits,
  )
  expect(refused.kind).toBe('encoded')
  if (refused.kind !== 'encoded') return
  expect(createSessionResponse(refused.bytes, 'demo-session', limits)).toEqual({
    kind: 'response',
    response: {
      protocolVersion: version,
      messageId: 'demo-session',
      outcome: 'protocol-rejected',
      body: {},
    },
  })
})
