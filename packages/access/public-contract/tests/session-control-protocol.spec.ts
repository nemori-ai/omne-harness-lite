import {
  encodeSessionRequest,
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
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const omit = (value: object, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
const read = (value: unknown) => readSessionRequest({ bytes: bytes(value), limits })

const wires = {
  'cancel-run': {
    protocolVersion: version,
    messageId: 'm',
    operation: 'cancel-run',
    loginProof: 'proof',
    body: {
      tenant: tenantText,
      session,
      controlId: 'control-1',
      run: 'run-1',
      urgency: 'graceful',
    },
  },
  'stop-call': {
    protocolVersion: version,
    messageId: 'm',
    operation: 'stop-call',
    loginProof: 'proof',
    body: {
      tenant: tenantText,
      session,
      controlId: 'control-1',
      producer: { kind: 'model', call: 'call-1' },
    },
  },
} as const
const operations = Object.keys(wires) as (keyof typeof wires)[]
const withBody = (operation: keyof typeof wires, body: Record<string, unknown>) => ({
  ...wires[operation],
  body: { ...wires[operation].body, ...body },
})
const withProducer = (producer: unknown) => withBody('stop-call', { producer })

function expectRejected(wire: unknown) {
  expect(read(wire)).toMatchObject({
    kind: 'protocol-rejected',
    response: { protocolVersion: version, outcome: 'protocol-rejected', body: {} },
    diagnostic: { code: 'field' },
  })
}

describe('accepted interruption requests', () => {
  it.each([
    ['cancel-run graceful', wires['cancel-run']],
    ['cancel-run force', withBody('cancel-run', { urgency: 'force' })],
    ['stop-call model', wires['stop-call']],
    ['stop-call tool', withProducer({ kind: 'tool', call: 'call-2' })],
  ] as const)('%s reads to a typed request and re-encodes to the same wire', (_name, wire) => {
    const result = read(wire)
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') return
    expect(result.request.operation).toBe(wire.operation)
    expect(result.request.proof).toEqual({ kind: 'present', value: 'proof' })
    expect('actingTenant' in result.request).toBe(false)
    const body = result.request.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(Object.keys(wire.body).sort())
    expect(body.controlId).toBe(wire.body.controlId)
    expect(body.session).toBe(session)
    expect(tenantCodec.encode(body.tenant as typeof tenant)).toEqual({
      ok: true,
      value: tenantText,
    })
    if (wire.operation === 'cancel-run') {
      expect(body.run).toBe('run-1')
      expect(body.urgency).toBe((wire.body as { urgency: string }).urgency)
    } else {
      expect(body.producer).toEqual((wire.body as { producer: unknown }).producer)
    }
    const encoded = encodeSessionRequest({ request: result.request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded')
      expect(JSON.parse(new TextDecoder().decode(encoded.bytes))).toEqual(wire)
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
})

describe('interruption request rejections, one violated rule each', () => {
  it.each(
    operations.flatMap(operation =>
      Object.keys(wires[operation].body).map(field => [operation, field] as const),
    ),
  )('rejects %s without its body field %s', (operation, field) => {
    expectRejected({ ...wires[operation], body: omit(wires[operation].body, field) })
  })

  it.each(operations)('rejects an unknown body key on %s', operation => {
    expectRejected(withBody(operation, { extra: 'x' }))
  })

  it.each(operations)('rejects an empty controlId on %s', operation => {
    expectRejected(withBody(operation, { controlId: '' }))
  })

  it.each(operations)('rejects a non-string controlId on %s', operation => {
    expectRejected(withBody(operation, { controlId: 1 }))
  })

  it.each(operations)('rejects actingTenant on %s', operation => {
    expectRejected({ ...wires[operation], actingTenant: tenantText })
  })

  it.each(operations)('rejects an invalid tenant text on %s', operation => {
    expectRejected(withBody(operation, { tenant: 'tenant' }))
  })

  it.each(operations)('rejects an invalid session text on %s', operation => {
    expectRejected(withBody(operation, { session: session.toUpperCase() }))
  })

  it.each(['login', 'loginId', 'operation', 'operationId', 'sessionOperationId', 'principal'])(
    'rejects client-filled identity field %s on both operations',
    field => {
      for (const operation of operations) expectRejected(withBody(operation, { [field]: 'x' }))
    },
  )

  it('rejects an empty run', () => {
    expectRejected(withBody('cancel-run', { run: '' }))
  })

  it('rejects a non-string run', () => {
    expectRejected(withBody('cancel-run', { run: 1 }))
  })

  it.each(['urgent', 'Graceful', '', 1, null])('rejects the urgency %j', urgency => {
    expectRejected(withBody('cancel-run', { urgency }))
  })

  it.each(['agent', 'Model', '', 1, null])('rejects the producer kind %j', kind => {
    expectRejected(withProducer({ kind, call: 'call-1' }))
  })

  it('rejects an empty producer call', () => {
    expectRejected(withProducer({ kind: 'model', call: '' }))
  })

  it('rejects a producer without call', () => {
    expectRejected(withProducer({ kind: 'model' }))
  })

  it('rejects a producer without kind', () => {
    expectRejected(withProducer({ call: 'call-1' }))
  })

  it('rejects a producer with an extra key', () => {
    expectRejected(withProducer({ kind: 'model', call: 'call-1', extra: 'x' }))
  })

  it.each(['model:call-1', null, ['model', 'call-1'], 1])('rejects the producer %j', producer => {
    expectRejected(withProducer(producer))
  })

  it('rejects run on stop-call and producer on cancel-run: the two bodies stay apart', () => {
    expectRejected(withBody('stop-call', { run: 'run-1' }))
    expectRejected(withBody('cancel-run', { producer: { kind: 'model', call: 'c' } }))
  })

  it('keeps rejected values out of the result', () => {
    const result = read(withBody('cancel-run', { urgency: 'secret-urgency', extra: 'secret' }))
    expect(result.kind).toBe('protocol-rejected')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})

describe('interruption request encoding', () => {
  const cancel: SessionRequest<'cancel-run'> = {
    protocolVersion: version,
    messageId: 'm',
    operation: 'cancel-run',
    proof: { kind: 'present', value: 'proof' },
    body: { tenant, session, controlId: 'control-1', run: 'run-1', urgency: 'force' },
  }
  const stop: SessionRequest<'stop-call'> = {
    protocolVersion: version,
    messageId: 'm',
    operation: 'stop-call',
    proof: { kind: 'present', value: 'proof' },
    body: { tenant, session, controlId: 'control-1', producer: { kind: 'tool', call: 'call-1' } },
  }
  const encode = (value: unknown) =>
    encodeSessionRequest({ request: value as SessionRequest, limits })
  const invalid = { kind: 'invalid', diagnostic: { code: 'field' } }

  it.each([
    ['cancel-run', cancel],
    ['stop-call', stop],
  ] as const)('encodes a valid %s', (_name, request) => {
    expect(encode(request).kind).toBe('encoded')
  })

  it.each([
    ['an empty controlId', { ...cancel, body: { ...cancel.body, controlId: '' } }],
    ['an empty run', { ...cancel, body: { ...cancel.body, run: '' } }],
    ['an unknown urgency', { ...cancel, body: { ...cancel.body, urgency: 'soon' } }],
    ['an unknown body key', { ...cancel, body: { ...cancel.body, login: 'x' } }],
    ['actingTenant', { ...cancel, actingTenant: tenant }],
    ['a forged tenant text', { ...cancel, body: { ...cancel.body, tenant: tenantText } }],
    ['a missing proof', omit(cancel, 'proof')],
    [
      'an unknown producer kind',
      { ...stop, body: { ...stop.body, producer: { kind: 'x', call: 'c' } } },
    ],
    [
      'an empty producer call',
      { ...stop, body: { ...stop.body, producer: { kind: 'tool', call: '' } } },
    ],
    [
      'an extra producer key',
      { ...stop, body: { ...stop.body, producer: { kind: 'tool', call: 'c', x: 1 } } },
    ],
    ['a missing producer', { ...stop, body: omit(stop.body, 'producer') }],
    ['a run on stop-call', { ...stop, body: { ...stop.body, run: 'run-1' } }],
  ])('returns invalid for %s', (_name, model) => {
    expect(encode(model)).toEqual(invalid)
  })
})
