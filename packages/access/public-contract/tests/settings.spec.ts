// The four setting governance operations (SPEC「设置项」): the envelope, the closed bodies with the
// optional asset category, the result sets with `not-writable`, the item views, and that no
// response or rejection can carry the secret.
import {
  encodeGovernanceRequest,
  encodeGovernanceResponse,
  readGovernanceRequest,
  readGovernanceResponse,
  type GovernanceProvidedOperation,
  type GovernanceResponseEncodeInput,
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
const account = 'acc_00000000000000000000000000'
const organization = 'org_00000000000000000000000000'
const tenantId = JSON.stringify({ organization, account })
const at = '2026-11-09T08:00:00.000Z'
const SENTINEL = 'exa-sentinel-0123456789'
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const text = (value: Uint8Array) => new TextDecoder().decode(value)

const SETTING_OPERATIONS = [
  'list-settings',
  'set-setting',
  'describe-setting',
  'clear-setting',
] as const
type SettingOperation = (typeof SETTING_OPERATIONS)[number]

const web = { category: 'tool', name: 'Web' }
const bodies: Readonly<Record<SettingOperation, Record<string, unknown>>> = {
  'list-settings': { asset: web },
  'set-setting': { asset: web, item: 'exa.apiKey', secret: SENTINEL },
  'describe-setting': { asset: web, item: 'exa.apiKey' },
  'clear-setting': { asset: web, item: 'exa.apiKey' },
}

function requestWire(operation: SettingOperation, body: unknown, envelope: object = {}) {
  return {
    protocolVersion: 'governance-public/1',
    messageId: 'm',
    operation,
    loginProof: 'proof',
    actingTenant: tenantId,
    body,
    ...envelope,
  }
}

function readRequest(wire: unknown) {
  return readGovernanceRequest({ bytes: bytes(wire), limits })
}

function read(operation: GovernanceProvidedOperation, outcome: string, body: unknown) {
  return readGovernanceResponse({
    bytes: bytes({ protocolVersion: 'governance-public/1', messageId: 'm', outcome, body }),
    operation,
    expectedMessageId: 'm',
    limits,
  })
}

/** Reads a success, encodes it again and returns the body that went back on the wire. */
function roundTrip(operation: SettingOperation, body: unknown): unknown {
  const result = read(operation, 'succeeded', body)
  expect(result.kind, JSON.stringify(body)).toBe('response')
  if (result.kind !== 'response') return undefined
  const encoded = encodeGovernanceResponse({
    operation,
    response: result.response,
    limits,
  } as GovernanceResponseEncodeInput)
  expect(encoded.kind).toBe('encoded')
  return encoded.kind === 'encoded' ? JSON.parse(text(encoded.bytes)).body : undefined
}

describe('requests', () => {
  it.each(SETTING_OPERATIONS)('%s needs the login proof and the acting tenant', operation => {
    const wire = requestWire(operation, bodies[operation])
    const result = readRequest(wire)
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') return
    expect(result.request.operation).toBe(operation)
    expect('proof' in result.request && result.request.proof).toEqual({
      kind: 'present',
      value: 'proof',
    })
    expect('actingTenant' in result.request).toBe(true)
    const encoded = encodeGovernanceRequest({ request: result.request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(JSON.parse(text(encoded.bytes))).toEqual(wire)

    // Controls: without the acting tenant the request is not this protocol; without the proof it
    // is a request, and identity answers the missing proof.
    expect(
      readRequest(requestWire(operation, bodies[operation], { actingTenant: undefined })),
    ).toEqual({
      kind: 'protocol-rejected',
      response: {
        protocolVersion: 'governance-public/1',
        messageId: 'm',
        outcome: 'protocol-rejected',
        body: {},
      },
      diagnostic: { code: 'field' },
    })
    const unproved = readRequest(
      requestWire(operation, bodies[operation], { loginProof: undefined }),
    )
    expect(unproved.kind).toBe('request')
    if (unproved.kind === 'request' && 'proof' in unproved.request)
      expect(unproved.request.proof).toEqual({ kind: 'missing' })
  })

  it('set-setting reads the secret, and refuses a missing, empty or mistyped one without echoing it', () => {
    const result = readRequest(requestWire('set-setting', bodies['set-setting']))
    expect(result.kind).toBe('request')
    if (result.kind === 'request' && result.request.operation === 'set-setting')
      expect(result.request.body).toEqual(bodies['set-setting'])
    for (const body of [
      { asset: web, item: 'exa.apiKey' },
      { asset: web, item: 'exa.apiKey', secret: '' },
      { asset: web, item: 'exa.apiKey', secret: 1 },
      { asset: web, item: 'exa.apiKey', secret: null },
      { asset: web, item: 'exa.apiKey', secret: SENTINEL, value: 'x' },
      { asset: web, secret: SENTINEL },
      { asset: web, item: '', secret: SENTINEL },
      { item: 'exa.apiKey', secret: SENTINEL },
    ]) {
      const refused = readRequest(requestWire('set-setting', body))
      expect(refused.kind, JSON.stringify(body)).toBe('protocol-rejected')
      expect(JSON.stringify(refused)).not.toContain(SENTINEL)
    }
  })

  it.each(SETTING_OPERATIONS)('%s takes the asset with or without a category', operation => {
    const named = { ...bodies[operation], asset: { name: 'Web' } }
    const result = readRequest(requestWire(operation, named))
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') return
    expect(result.request.body).toEqual(named)
    const encoded = encodeGovernanceRequest({ request: result.request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(JSON.parse(text(encoded.bytes)).body).toEqual(named)
  })

  it.each(SETTING_OPERATIONS)('%s refuses extra fields and a malformed asset', operation => {
    const body = bodies[operation]
    for (const bad of [
      { ...body, extra: 'x' },
      { ...body, tenant: tenantId },
      { ...body, asset: { ...web, owner: 'x' } },
      { ...body, asset: { category: 'tool' } },
      { ...body, asset: { name: '' } },
      { ...body, asset: { category: '', name: 'Web' } },
      { ...body, asset: 'tool:Web' },
      { ...body, asset: null },
    ])
      expect(readRequest(requestWire(operation, bad)).kind, JSON.stringify(bad)).toBe(
        'protocol-rejected',
      )
  })

  it('list-settings may omit the asset; the three item operations may not', () => {
    expect(readRequest(requestWire('list-settings', {})).kind).toBe('request')
    for (const operation of ['set-setting', 'describe-setting', 'clear-setting'] as const) {
      const body: Record<string, unknown> = { ...bodies[operation] }
      delete body['asset']
      expect(readRequest(requestWire(operation, body)).kind, operation).toBe('protocol-rejected')
    }
    expect(readRequest(requestWire('list-settings', { asset: web, item: 'exa.apiKey' })).kind).toBe(
      'protocol-rejected',
    )
  })
})

describe('responses', () => {
  const bound = { state: 'usable', tenantId, configuredAt: at }
  const states = [
    { state: 'unbound' },
    bound,
    { state: 'usable', tenantId },
    { state: 'revoked', tenantId, configuredAt: at },
    { state: 'unreadable', tenantId },
  ]
  const badStates = [
    {},
    { state: 'unbound', tenantId },
    { state: 'unbound', configuredAt: at },
    { state: 'usable' },
    { state: 'usable', tenantId: 'not-a-tenant' },
    { state: 'usable', tenantId, configuredAt: 'not-an-instant' },
    { ...bound, secret: SENTINEL },
    { ...bound, value: SENTINEL },
    { state: 'bound', tenantId },
  ]

  it('set-setting succeeds with the configuration time only', () => {
    expect(roundTrip('set-setting', { configuredAt: at })).toEqual({ configuredAt: at })
    for (const body of [
      {},
      { configuredAt: 'not-an-instant' },
      { configuredAt: at, secret: SENTINEL },
      { configuredAt: at, tenantId },
    ])
      expect(read('set-setting', 'succeeded', body).kind, JSON.stringify(body)).toBe('unreadable')
  })

  it('describe-setting shows presence, owner and time, never the secret', () => {
    for (const body of states) expect(roundTrip('describe-setting', body)).toEqual(body)
    for (const body of [...badStates, { state: 'not-writable' }])
      expect(read('describe-setting', 'succeeded', body).kind, JSON.stringify(body)).toBe(
        'unreadable',
      )
  })

  it('list-settings lists secret items with their state and ordinary items as not-writable', () => {
    const items = [
      ...states.map(state => ({
        asset: web,
        item: 'exa.apiKey',
        title: 'Exa API key',
        sensitivity: 'secret',
        state,
      })),
      {
        asset: { category: 'tool', name: 'Web' },
        item: 'maxResults',
        title: 'Search results',
        sensitivity: 'ordinary',
        state: { state: 'not-writable' },
      },
    ]
    const body = { items, completeness: 'complete' }
    expect(roundTrip('list-settings', body)).toEqual(body)
    expect(roundTrip('list-settings', { items: [], completeness: 'complete' })).toEqual({
      items: [],
      completeness: 'complete',
    })
    const item = items[1] as Record<string, unknown>
    for (const bad of [
      { items },
      { items, completeness: 'partial' },
      { items: [{ ...item, secret: SENTINEL }], completeness: 'complete' },
      { items: [{ ...item, asset: { name: 'Web' } }], completeness: 'complete' },
      { items: [{ ...item, sensitivity: 'hidden' }], completeness: 'complete' },
      { items: [{ ...item, title: undefined }], completeness: 'complete' },
      ...badStates.map(state => ({ items: [{ ...item, state }], completeness: 'complete' })),
    ])
      expect(read('list-settings', 'succeeded', bad).kind, JSON.stringify(bad)).toBe('unreadable')
  })

  it('clear-setting answers succeeded and no-change with an empty body', () => {
    expect(roundTrip('clear-setting', {})).toEqual({})
    expect(read('clear-setting', 'no-change', {}).kind).toBe('response')
    expect(read('clear-setting', 'no-change', { configuredAt: at }).kind).toBe('unreadable')
    expect(read('clear-setting', 'succeeded', { configuredAt: at }).kind).toBe('unreadable')
  })

  const allowed: Readonly<Record<SettingOperation, readonly string[]>> = {
    'list-settings': ['denied', 'basis-unavailable'],
    'set-setting': [
      'denied',
      'not-visible',
      'conflict',
      'not-writable',
      'basis-unavailable',
      'unknown',
    ],
    'describe-setting': ['denied', 'not-visible', 'conflict', 'not-writable', 'basis-unavailable'],
    'clear-setting': [
      'no-change',
      'denied',
      'not-visible',
      'conflict',
      'not-writable',
      'basis-unavailable',
      'unknown',
    ],
  }

  it.each(SETTING_OPERATIONS)(
    '%s permits exactly its result set, each with an empty body',
    operation => {
      for (const outcome of [
        'no-change',
        'denied',
        'not-visible',
        'conflict',
        'not-writable',
        'basis-unavailable',
        'unknown',
        'need-decision',
        'not-loginable',
        'uniform-auth-failure',
      ]) {
        const permitted = allowed[operation].includes(outcome)
        expect(read(operation, outcome, {}).kind, outcome).toBe(
          permitted ? 'response' : 'unreadable',
        )
        expect(read(operation, outcome, { secret: SENTINEL }).kind, outcome).toBe('unreadable')
      }
      expect(read(operation, 'stage-not-provided', {}).kind).toBe('response')
    },
  )

  it('not-writable belongs to the setting operations only', () => {
    expect(read('bind-model-credential', 'not-writable', {}).kind).toBe('unreadable')
    expect(read('describe-model-credential', 'not-writable', {}).kind).toBe('unreadable')
  })

  it('the encoder refuses a success body that carries the secret', () => {
    for (const [operation, body] of [
      ['set-setting', { configuredAt: at, secret: SENTINEL }],
      ['describe-setting', { ...bound, secret: SENTINEL }],
    ] as const) {
      const encoded = encodeGovernanceResponse({
        operation,
        response: {
          protocolVersion: 'governance-public/1',
          messageId: 'm',
          outcome: 'succeeded',
          body,
        },
        limits,
      } as unknown as GovernanceResponseEncodeInput)
      expect(encoded.kind).toBe('invalid')
      expect(JSON.stringify(encoded)).not.toContain(SENTINEL)
    }
  })
})
