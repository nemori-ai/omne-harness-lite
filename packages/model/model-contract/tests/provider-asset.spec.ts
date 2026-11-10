// The model provider asset (SPEC「模型供应商资产」): which bodies the category contract accepts, and
// the secret settings its hook derives through the asset domain's projection.
import {
  capabilityId,
  createCategoryRegistry,
  pinBody,
  projectAssetSettings,
  readBodyText,
  type JsonValue,
} from '@omne-harness/assets'
import {
  MODEL_PROVIDER_CATEGORY,
  modelProviderBodyContract,
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
    protocol: 'chat-completions',
    endpoint: { url: 'https://gateway.test/v1/chat', endMarker: '[DONE]' },
    accounting: { place: 'test-gateway', costUnit: 'test-credit' },
    credentials: [CREDENTIAL],
    ...overrides,
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
  it('accepts a body with a name, a protocol, an https endpoint, accounting and credential items', () => {
    expect(judge(plainBody(), 'test-gateway')).toEqual({ ok: true })
  })

  it('accepts a provider that declares no credential item', () => {
    expect(judge(plainBody({ credentials: [] }))).toEqual({ ok: true })
  })

  it.each([
    ['a name outside the provider alphabet', { name: 'Test Gateway' }, 'invalid-name'],
    ['an empty protocol', { protocol: '' }, 'invalid-protocol'],
    ['a missing protocol', { protocol: undefined }, 'invalid-protocol'],
    ['an http endpoint', { endpoint: { url: 'http://gateway.test/v1' } }, 'invalid-endpoint'],
    [
      'an endpoint with credentials',
      { endpoint: { url: 'https://u:p@gateway.test/v1' } },
      'invalid-endpoint',
    ],
    [
      'an empty end marker',
      { endpoint: { url: 'https://gateway.test/v1', endMarker: '' } },
      'invalid-endpoint',
    ],
    ['accounting without a cost unit', { accounting: { place: 'x' } }, 'invalid-accounting'],
    ['credentials that are not a list', { credentials: CREDENTIAL }, 'invalid-credentials'],
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
  })
})

describe('readModelProviderBody', () => {
  it('reads the judged body in its typed form', () => {
    expect(readModelProviderBody(body(plainBody()))).toEqual({
      name: 'test-gateway',
      protocol: 'chat-completions',
      endpoint: { url: 'https://gateway.test/v1/chat', endMarker: '[DONE]' },
      accounting: { place: 'test-gateway', costUnit: 'test-credit' },
      credentials: [CREDENTIAL],
    })
  })

  it('answers undefined for a body the contract refuses', () => {
    expect(readModelProviderBody(body(plainBody({ protocol: '' })))).toBeUndefined()
    expect(parseModelProviderBody(body(plainBody({ protocol: '' })))).toEqual({
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
    const registry = createCategoryRegistry()
    registry.register(modelProviderBodyContract())
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
    expect(project(plainBody({ endpoint: { url: 'http://gateway.test' } }))).toEqual({
      kind: 'rejected',
      reason: 'invalid_body',
    })
  })
})
