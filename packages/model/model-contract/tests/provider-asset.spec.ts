import {
  capabilityId,
  createCategoryPoint,
  pinBody,
  projectAssetSettings,
  readBodyText,
  type JsonValue,
} from '@omne-harness/assets'
import {
  MODEL_PROVIDER_CATEGORY,
  modelProviderBodyContract,
  modelProviderCategoryDisplay,
  parseModelProviderBody,
  readModelProviderBody,
} from '@omne-harness/model-contract/provider-asset'
import { decodeProviderName } from '@omne-harness/model-contract'
import { describe, expect, it } from 'vitest'

const LIMITS = {
  maxBytes: 8192,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 16,
  maxStringLength: 400,
  maxNumberLength: 20,
}

const CREDENTIAL = {
  item: 'apiKey',
  title: 'API key',
  description: 'The key requests send to the provider.',
  impact: 'The next request uses the new key.',
  clear: 'Official models use the deployment default key.',
}

function plainBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'test-gateway',
    endpoints: [
      { protocol: 'chat-completions', url: 'https://gateway.test/v1/chat', endMarker: '[DONE]' },
    ],
    accounting: { place: 'test-gateway', costUnit: 'test-credit' },
    credentials: [CREDENTIAL],
    ...overrides,
  }
}

// A body whose one endpoint is the chat-completions endpoint changed by the given members.
function one(change: Record<string, unknown>): { endpoints: Record<string, unknown>[] } {
  return {
    endpoints: [{ protocol: 'chat-completions', url: 'https://gateway.test/v1', ...change }],
  }
}

function body(plain: unknown): JsonValue {
  const read = readBodyText(JSON.stringify(plain), LIMITS)
  if (read.kind !== 'ok') throw new Error('fixture body is not a document')
  return read.value
}

const judge = (plain: unknown, capabilityName?: string) =>
  modelProviderBodyContract().judge(
    body(plain),
    capabilityName === undefined ? undefined : { capabilityName },
  )

describe('modelProviderBodyContract: judge', () => {
  it('accepts a body with a name, https endpoints by protocol, accounting and credential items', () => {
    expect(judge(plainBody(), 'test-gateway')).toEqual({ ok: true })
  })

  it('accepts a provider that declares no credential item', () => {
    expect(judge(plainBody({ credentials: [] }))).toEqual({ ok: true })
  })

  it('accepts an endpoint without an end marker and reads it without one', () => {
    const plain = plainBody({
      endpoints: [{ protocol: 'messages', url: 'https://gateway.test/v1' }],
    })
    expect(judge(plain)).toEqual({ ok: true })
    expect(readModelProviderBody(body(plain))?.endpoints).toEqual([
      { protocol: 'messages', url: 'https://gateway.test/v1' },
    ])
  })

  it('reads several endpoints, one per protocol, in their order', () => {
    const endpoints = [
      { protocol: 'chat-completions', url: 'https://gateway.test/v1/chat', endMarker: '[DONE]' },
      { protocol: 'messages', url: 'https://gateway.test/v1/messages' },
      { protocol: 'responses', url: 'https://gateway.test/v1/responses' },
    ]
    expect(readModelProviderBody(body(plainBody({ endpoints })))?.endpoints).toEqual(endpoints)
  })

  it.each([
    ['a name outside the provider alphabet', { name: 'Test Gateway' }, 'invalid-name'],
    ['an empty protocol', one({ protocol: '' }), 'invalid-protocol'],
    ['a missing protocol', one({ protocol: undefined }), 'invalid-protocol'],
    ['no endpoints', { endpoints: [] }, 'invalid-endpoints'],
    [
      'endpoints that are not a list',
      { endpoints: { url: 'https://gateway.test/v1' } },
      'invalid-endpoints',
    ],
    [
      'two endpoints for one protocol',
      { endpoints: [one({}).endpoints[0], one({}).endpoints[0]] },
      'duplicate-protocol',
    ],
    ['an http endpoint', one({ url: 'http://gateway.test/v1' }), 'invalid-endpoint'],
    [
      'an endpoint with credentials',
      one({ url: 'https://u:p@gateway.test/v1' }),
      'invalid-endpoint',
    ],
    ['an endpoint with a user name', one({ url: 'https://u@gateway.test/v1' }), 'invalid-endpoint'],
    ['an endpoint with a password', one({ url: 'https://:p@gateway.test/v1' }), 'invalid-endpoint'],
    ['an endpoint with a fragment', one({ url: 'https://gateway.test/v1#x' }), 'invalid-endpoint'],
    ['an endpoint that is not a URL', one({ url: 'gateway test' }), 'invalid-endpoint'],
    [
      'an endpoint that is not an object',
      { endpoints: ['https://gateway.test/v1'] },
      'invalid-endpoint',
    ],
    [
      'an empty end marker',
      one({ url: 'https://gateway.test/v1', endMarker: '' }),
      'invalid-endpoint',
    ],
    [
      'an end marker that is not a string',
      one({ url: 'https://gateway.test/v1', endMarker: 7 }),
      'invalid-endpoint',
    ],
    ['accounting without a cost unit', { accounting: { place: 'x' } }, 'invalid-accounting'],
    [
      'accounting with an empty cost unit',
      { accounting: { place: 'x', costUnit: '' } },
      'invalid-accounting',
    ],
    ['accounting without a place', { accounting: { costUnit: 'x' } }, 'invalid-accounting'],
    [
      'accounting with an empty place',
      { accounting: { place: '', costUnit: 'x' } },
      'invalid-accounting',
    ],
    ['accounting that is not an object', { accounting: 'x' }, 'invalid-accounting'],
    ['missing credentials', { credentials: undefined }, 'invalid-credentials'],
    ['credentials that are not a list', { credentials: CREDENTIAL }, 'invalid-credentials'],
    [
      'a credential entry that is not an object',
      { credentials: ['apiKey'] },
      'invalid-credentials',
    ],
    [
      'a credential entry without an item',
      { credentials: [{ ...CREDENTIAL, item: undefined }] },
      'invalid-credentials',
    ],
    [
      'a credential item with an invalid name',
      { credentials: [{ ...CREDENTIAL, item: 'api key' }] },
      'invalid-credentials',
    ],
    [
      'a credential item without a clear text',
      { credentials: [{ ...CREDENTIAL, clear: '' }] },
      'invalid-credentials',
    ],
    [
      'two credential items of one name',
      { credentials: [CREDENTIAL, CREDENTIAL] },
      'duplicate-credential',
    ],
  ])('refuses %s', (_case, overrides, reason) => {
    expect(judge(plainBody(overrides))).toEqual({ ok: false, rejected: reason })
  })

  it('refuses a body whose name is not the capability name', () => {
    expect(judge(plainBody(), 'other-gateway')).toEqual({ ok: false, rejected: 'name-mismatch' })
  })

  it('refuses a value that is not an object', () => {
    expect(modelProviderBodyContract().judge('test-gateway')).toEqual({
      ok: false,
      rejected: 'not-an-object',
    })
    expect(judge([plainBody()])).toEqual({ ok: false, rejected: 'not-an-object' })
  })
})

describe('modelProviderBodyContract: hooks', () => {
  const contract = modelProviderBodyContract()

  it('derives the settings definition without a context, at the unpinned version', () => {
    const definitions = contract.settings?.(body(plainBody()))
    expect(definitions).toMatchObject({
      providerId: MODEL_PROVIDER_CATEGORY,
      definitionId: 'test-gateway',
      version: '0',
    })
    expect(definitions?.items).toEqual([
      {
        id: 'apiKey',
        groupId: 'credentials',
        category: 'binding',
        presentation: {
          title: CREDENTIAL.title,
          description: CREDENTIAL.description,
          impact: CREDENTIAL.impact,
          clear: CREDENTIAL.clear,
          adoption: 'next-read',
        },
        valueSchema: { type: 'string' },
        default: { kind: 'absent' },
        merge: 'override',
        sensitivity: 'secret',
      },
    ])
  })

  it('derives the settings definition at the pinned definition version', () => {
    expect(contract.settings?.(body(plainBody()), { definition: '3' })?.version).toBe('3')
  })

  it('derives no declarations and no references', () => {
    expect(contract.deriveDeclarations(body(plainBody()))).toEqual({ entries: [] })
    expect(contract.references(body(plainBody()))).toEqual([])
  })

  it('throws when a hook receives a body the registry would have refused', () => {
    const refused = body(plainBody(one({ protocol: '' })))
    expect(() => contract.settings?.(refused)).toThrow(
      'model provider body failed judgment: invalid-protocol',
    )
    expect(() => contract.deriveDeclarations(refused)).toThrow(TypeError)
    expect(() => contract.references(refused)).toThrow(TypeError)
  })
})

describe('readModelProviderBody', () => {
  it('reads the judged body in its typed form', () => {
    expect(readModelProviderBody(body(plainBody()))).toEqual({
      name: 'test-gateway',
      endpoints: [
        { protocol: 'chat-completions', url: 'https://gateway.test/v1/chat', endMarker: '[DONE]' },
      ],
      accounting: { place: 'test-gateway', costUnit: 'test-credit' },
      credentials: [CREDENTIAL],
    })
  })

  it('answers undefined for a body the contract refuses', () => {
    expect(readModelProviderBody(body(plainBody(one({ protocol: '' }))))).toBeUndefined()
    expect(parseModelProviderBody(body(plainBody(one({ protocol: '' }))))).toEqual({
      failure: 'invalid-protocol',
    })
  })
})

describe('decodeProviderName', () => {
  it('mints a name in the provider alphabet and refuses any other text', () => {
    expect(decodeProviderName('openrouter')).toEqual({ ok: 'openrouter' })
    expect(decodeProviderName('-openrouter')).toEqual({ failure: 'invalid-name' })
    expect(decodeProviderName(7)).toEqual({ failure: 'invalid-name' })
  })
})

describe('modelProviderBodyContract: settings through projectAssetSettings', () => {
  function project(plain: unknown) {
    const registry = createCategoryPoint()
    registry.contribute({
      contract: modelProviderBodyContract(),
      display: modelProviderCategoryDisplay,
      point: 'model.providers',
    })
    const identity = capabilityId(MODEL_PROVIDER_CATEGORY, 'test-gateway')
    if (!identity.ok) throw new Error('capability id fixture')
    const pinned = pinBody({
      identity: identity.id,
      version: '1',
      source: 'official',
      body: body(plain),
    })
    return projectAssetSettings(registry, {
      assetRef: 'official/model-provider/test-gateway',
      pinned,
    })
  }

  it('derives one secret binding item per credential item, with an absent default', () => {
    const projection = project(
      plainBody({ credentials: [CREDENTIAL, { ...CREDENTIAL, item: 'organization' }] }),
    )
    if (projection.kind !== 'declared') throw new Error(`projection ${projection.kind}`)
    expect(projection.definition.definitionId).toBe('test-gateway')
    expect(
      projection.definition.items.map(item => ({
        id: item.id,
        category: item.category,
        sensitivity: item.sensitivity,
        default: item.default,
        title: item.presentation.title,
      })),
    ).toEqual([
      {
        id: 'apiKey',
        category: 'binding',
        sensitivity: 'secret',
        default: { kind: 'absent' },
        title: 'API key',
      },
      {
        id: 'organization',
        category: 'binding',
        sensitivity: 'secret',
        default: { kind: 'absent' },
        title: 'API key',
      },
    ])
  })

  it('declares no settings for a provider without credential items', () => {
    expect(project(plainBody({ credentials: [] })).kind).toBe('none')
  })

  it('refuses to project a body the contract refuses', () => {
    expect(project(plainBody(one({ url: 'http://gateway.test' })))).toEqual({
      kind: 'rejected',
      reason: 'invalid_body',
    })
  })
})
