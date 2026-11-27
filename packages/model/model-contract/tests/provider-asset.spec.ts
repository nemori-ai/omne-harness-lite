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
  preferencesOf,
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
    models: [],
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
    [
      'accounting whose generation is not an object',
      { accounting: { place: 'x', costUnit: 'y', generation: 'x-id' } },
      'invalid-accounting',
    ],
    [
      'accounting whose generation names no header',
      { accounting: { place: 'x', costUnit: 'y', generation: { path: '/cost' } } },
      'invalid-accounting',
    ],
    [
      'accounting whose generation header is no header name',
      {
        accounting: {
          place: 'x',
          costUnit: 'y',
          generation: { requestHeader: 'X Id', path: '/cost' },
        },
      },
      'invalid-accounting',
    ],
    [
      'accounting whose generation header only starts as a header name',
      {
        accounting: {
          place: 'x',
          costUnit: 'y',
          generation: { requestHeader: 'x-id: more', path: '/cost' },
        },
      },
      'invalid-accounting',
    ],
    [
      'accounting whose generation names no path',
      { accounting: { place: 'x', costUnit: 'y', generation: { requestHeader: 'x-id' } } },
      'invalid-accounting',
    ],
    [
      'accounting whose generation path is not a path of the origin',
      {
        accounting: {
          place: 'x',
          costUnit: 'y',
          generation: { requestHeader: 'x-id', path: 'https://elsewhere.test/cost' },
        },
      },
      'invalid-accounting',
    ],
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
  const contract = () => modelProviderBodyContract()

  it('derives the settings definition: the credential items follow the two preferences', () => {
    const definitions = contract().settings?.(body(plainBody()))
    expect(definitions).toMatchObject({
      providerId: MODEL_PROVIDER_CATEGORY,
      definitionId: 'test-gateway',
    })
    expect(definitions?.items.slice(2)).toEqual([
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

  it('derives no declarations and no references', () => {
    expect(contract().deriveDeclarations(body(plainBody()))).toEqual({ entries: [] })
    expect(contract().references(body(plainBody()))).toEqual([])
  })

  it('throws when a hook receives a body the registry would have refused', () => {
    const refused = body(plainBody(one({ protocol: '' })))
    expect(() => contract().settings?.(refused)).toThrow(
      'model provider body failed judgment: invalid-protocol',
    )
    expect(() => contract().deriveDeclarations(refused)).toThrow(TypeError)
    expect(() => contract().references(refused)).toThrow(TypeError)
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
      models: [],
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
      projection.definition.items
        .filter(item => item.sensitivity === 'secret')
        .map(item => ({
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

  it('refuses to project a body the contract refuses', () => {
    expect(project(plainBody(one({ url: 'http://gateway.test' })))).toEqual({
      kind: 'rejected',
      reason: 'invalid_body',
    })
  })
})

const MODEL = {
  kind: 'llm',
  model: 'vendor/model-a',
  title: 'Model A',
  input: ['text', 'image'],
  output: ['text'],
  window: '200000',
  efforts: ['low', 'medium', 'high'],
  enabled: true,
}

describe('the provider model catalog (C1, C2)', () => {
  const contract = () => modelProviderBodyContract()

  it('reads the catalog of models the provider adapts, in its order', () => {
    const second = { ...MODEL, model: 'vendor/model-b', efforts: [], enabled: false }
    const parsed = parseModelProviderBody(body(plainBody({ models: [MODEL, second] })))
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(parsed.ok.models).toEqual([MODEL, second])
  })

  it('reads a decisions model beside a chat model, with the question limit it states or none', () => {
    const judge = { kind: 'decisions', model: 'vendor/judge', title: 'Judge', enabled: true }
    const common = { input: ['text'], output: ['text'] }
    const limited = { ...judge, ...common, maxQuestions: '200' }
    const open = { ...judge, ...common, model: 'vendor/judge-open', enabled: false }
    const parsed = parseModelProviderBody(body(plainBody({ models: [MODEL, limited, open] })))
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(parsed.ok.models).toEqual([MODEL, limited, open])
    expect(Object.hasOwn(parsed.ok.models[2] ?? {}, 'maxQuestions')).toBe(false)
  })

  it('reads a live model beside a chat model, with the session limit it states or none', () => {
    const talk = { kind: 'live', model: 'vendor/talk', title: 'Talk', enabled: true }
    const common = { input: ['text', 'voice'], output: ['text', 'voice'] }
    const limited = { ...talk, ...common, maxSessionSeconds: '1800' }
    const open = { ...talk, ...common, model: 'vendor/talk-open', enabled: false }
    const parsed = parseModelProviderBody(body(plainBody({ models: [MODEL, limited, open] })))
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(parsed.ok.models).toEqual([MODEL, limited, open])
    expect(Object.hasOwn(parsed.ok.models[2] ?? {}, 'maxSessionSeconds')).toBe(false)
  })

  it('reads the accounting that states how a cost is asked afterwards, and the one that states nothing', () => {
    const generation = { requestHeader: 'x-generation-id', path: '/api/v1/generation' }
    const stated = { place: 'test-gateway', costUnit: 'test-credit', generation }
    const parsed = parseModelProviderBody(body(plainBody({ accounting: stated })))
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(parsed.ok.accounting).toEqual(stated)
    const plain = parseModelProviderBody(body(plainBody()))
    if (!('ok' in plain)) throw new Error(String(plain.failure))
    expect(plain.ok.accounting).toEqual({ place: 'test-gateway', costUnit: 'test-credit' })
  })

  it('reads a model that takes voice', () => {
    const omni = { ...MODEL, input: ['text', 'voice'] }
    const parsed = parseModelProviderBody(body(plainBody({ models: [omni] })))
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(parsed.ok.models[0]?.input).toEqual(['text', 'voice'])
  })

  it.each([
    ['a body without a catalog', { models: undefined }],
    ['two entries for one model', { models: [MODEL, MODEL] }],
    ['an effort outside the four', { models: [{ ...MODEL, efforts: ['max'] }] }],
    ['efforts out of their order', { models: [{ ...MODEL, efforts: ['high', 'low'] }] }],
    ['an effort twice', { models: [{ ...MODEL, efforts: ['low', 'low'] }] }],
    ['a window that is not a positive integer', { models: [{ ...MODEL, window: '0' }] }],
    ['a model without input', { models: [{ ...MODEL, input: [] }] }],
    ['an enabled default that is not a boolean', { models: [{ ...MODEL, enabled: 'yes' }] }],
    ['a catalog that is not a list', { models: { a: MODEL } }],
    ['a model without an enabled default', { models: [{ ...MODEL, enabled: undefined }] }],
    ['a model without a title', { models: [{ ...MODEL, title: '' }] }],
    ['a model without output', { models: [{ ...MODEL, output: undefined }] }],
    ['a window with a tail', { models: [{ ...MODEL, window: '200000k' }] }],
    ['a window with a head', { models: [{ ...MODEL, window: 'k200000' }] }],
    ['a modality that is not text', { models: [{ ...MODEL, input: ['text', 7] }] }],
    ['a modality no model takes', { models: [{ ...MODEL, input: ['text', 'video'] }] }],
    ['efforts that are not a list', { models: [{ ...MODEL, efforts: 'low' }] }],
    ['a model of no kind', { models: [{ ...MODEL, kind: undefined }] }],
    ['a model of an unknown kind', { models: [{ ...MODEL, kind: 'image' }] }],
    [
      'a decisions model whose question limit is no positive integer',
      { models: [{ ...MODEL, kind: 'decisions', maxQuestions: '0' }] },
    ],
    [
      'a decisions model whose question limit is written as null',
      { models: [{ ...MODEL, kind: 'decisions', maxQuestions: null }] },
    ],
    [
      'a live model whose session limit is no positive integer',
      { models: [{ ...MODEL, kind: 'live', maxSessionSeconds: '0' }] },
    ],
    [
      'a live model whose session limit is written as null',
      { models: [{ ...MODEL, kind: 'live', maxSessionSeconds: null }] },
    ],
    ['one model of one kind twice', { models: [MODEL, { ...MODEL, title: 'Again' }] }],
  ])('refuses %s', (_case, change) => {
    expect(parseModelProviderBody(body(plainBody(change)))).toEqual({
      failure: 'invalid-models',
    })
  })

  it('declares the two preferences of a tenant, also for a provider with no credential item', () => {
    const definitions = contract().settings?.(body(plainBody({ models: [MODEL], credentials: [] })))
    expect(definitions?.items.map(item => [item.id, item.category, item.sensitivity])).toEqual([
      ['model-switches', 'preference', 'ordinary'],
      ['model-reasoning-efforts', 'preference', 'ordinary'],
    ])
    for (const item of definitions?.items ?? []) expect(item.default).toEqual({ kind: 'absent' })
    expect(definitions?.groups.map(group => group.id)).toEqual(['models'])
  })

  it('declares the credential items after the preferences', () => {
    const definitions = contract().settings?.(body(plainBody({ models: [MODEL] })))
    expect(definitions?.items.map(item => item.id)).toEqual([
      'model-switches',
      'model-reasoning-efforts',
      'apiKey',
    ])
    expect(definitions?.groups.map(group => group.id)).toEqual(['models', 'credentials'])
  })

  it('a version of the declaration that follows its content, not the catalog or the asset version', () => {
    const one = contract().settings?.(body(plainBody({ models: [MODEL] })), { definition: '1' })
    const more = contract().settings?.(
      body(plainBody({ models: [MODEL, { ...MODEL, model: 'vendor/model-b' }] })),
      { definition: '2' },
    )
    expect(one?.version).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(more?.version).toBe(one?.version)
    const otherKey = contract().settings?.(
      body(plainBody({ models: [MODEL], credentials: [{ ...CREDENTIAL, item: 'other' }] })),
    )
    expect(otherKey?.version).not.toBe(one?.version)
  })

  it('a switch takes a boolean per model of each kind and an effort one of the four, nothing else', () => {
    const projection = projectAssetSettings(
      (() => {
        const point = createCategoryPoint()
        point.contribute({
          contract: contract(),
          display: modelProviderCategoryDisplay,
          point: 'model.providers',
        })
        return point
      })(),
      {
        assetRef: 'official/model-provider/test-gateway',
        pinned: pinBody({
          identity: (() => {
            const id = capabilityId(MODEL_PROVIDER_CATEGORY, 'test-gateway')
            if (!id.ok) throw new Error('identity')
            return id.id
          })(),
          version: '1',
          source: 'test',
          body: body(plainBody({ models: [MODEL] })),
        }),
      },
    )
    if (projection.kind !== 'declared') throw new Error(`projection ${projection.kind}`)
    const [switches, efforts] = projection.definition.items
    expect(switches?.valueSchema).toEqual({
      type: 'object',
      properties: {
        llm: { type: 'object', additionalProperties: { type: 'boolean' } },
        decisions: { type: 'object', additionalProperties: { type: 'boolean' } },
        live: { type: 'object', additionalProperties: { type: 'boolean' } },
      },
      additionalProperties: false,
    })
    expect(efforts?.valueSchema).toEqual({
      type: 'object',
      additionalProperties: { enum: ['low', 'medium', 'high', 'xhigh'] },
    })
  })
})

describe('the preferences of a tenant over the catalog (C4, C5, C7)', () => {
  const catalog = () => {
    const parsed = parseModelProviderBody(
      body(
        plainBody({
          models: [
            { ...MODEL, model: 'm/on', enabled: true, efforts: ['low', 'high'] },
            { ...MODEL, model: 'm/off', enabled: false, efforts: [] },
          ],
        }),
      ),
    )
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    return parsed.ok
  }

  const on = (preferences: ReturnType<typeof preferencesOf>) =>
    Object.fromEntries(
      Object.entries(preferences.enabled).map(([kind, models]) => [kind, [...models]]),
    )

  it('without settings each model is as the release enables it, with no default effort', () => {
    const preferences = preferencesOf(catalog(), undefined, undefined)
    expect(on(preferences)).toEqual({ llm: ['m/on'], decisions: [], live: [] })
    expect([...preferences.efforts]).toEqual([])
  })

  it('a switch of the tenant turns a model of its kind on or off', () => {
    const switches = { llm: { 'm/on': false, 'm/off': true } }
    expect(on(preferencesOf(catalog(), switches, undefined))).toEqual({
      llm: ['m/off'],
      decisions: [],
      live: [],
    })
  })

  it('a value that names models without their kind turns nothing on or off', () => {
    expect(preferencesOf(catalog(), { 'm/on': false, 'm/off': true }, undefined)).toEqual(
      preferencesOf(catalog(), undefined, undefined),
    )
  })

  it('a model that is both a chat model and a decisions model is two entries, each with its own switch', () => {
    const common = { model: 'm/both', title: 'Both', input: ['text'], output: ['text'] }
    const parsed = parseModelProviderBody(
      body(
        plainBody({
          models: [
            { ...common, kind: 'llm', window: '1000', efforts: [], enabled: true },
            { ...common, kind: 'decisions', enabled: true },
          ],
        }),
      ),
    )
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(on(preferencesOf(parsed.ok, { decisions: { 'm/both': false } }, undefined))).toEqual({
      llm: ['m/both'],
      decisions: [],
      live: [],
    })
  })

  it('a decisions model follows its switch as a chat model does, and takes no default effort', () => {
    const judge = { kind: 'decisions', model: 'm/judge', title: 'Judge', enabled: true }
    const parsed = parseModelProviderBody(
      body(plainBody({ models: [{ ...judge, input: ['text'], output: ['text'] }] })),
    )
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(on(preferencesOf(parsed.ok, undefined, undefined)).decisions).toEqual(['m/judge'])
    const off = { decisions: { 'm/judge': false } }
    expect(on(preferencesOf(parsed.ok, off, undefined)).decisions).toEqual([])
    expect(
      on(preferencesOf(parsed.ok, { llm: { 'm/judge': false } }, undefined)).decisions,
    ).toEqual(['m/judge'])
    expect(preferencesOf(parsed.ok, undefined, { 'm/judge': 'high' }).efforts.size).toBe(0)
  })

  it('a live model follows its switch as a decisions model does, and takes no default effort', () => {
    const talk = { kind: 'live', model: 'm/talk', title: 'Talk', enabled: true }
    const parsed = parseModelProviderBody(
      body(plainBody({ models: [{ ...talk, input: ['voice'], output: ['voice'] }] })),
    )
    if (!('ok' in parsed)) throw new Error(String(parsed.failure))
    expect(on(preferencesOf(parsed.ok, undefined, undefined)).live).toEqual(['m/talk'])
    expect(on(preferencesOf(parsed.ok, { live: { 'm/talk': false } }, undefined)).live).toEqual([])
    expect(
      on(preferencesOf(parsed.ok, { decisions: { 'm/talk': false } }, undefined)).live,
    ).toEqual(['m/talk'])
    expect(preferencesOf(parsed.ok, undefined, { 'm/talk': 'high' }).efforts.size).toBe(0)
  })

  it('takes a default effort only where the model supports it', () => {
    const preferences = preferencesOf(catalog(), undefined, { 'm/on': 'high', 'm/off': 'low' })
    expect([...preferences.efforts]).toEqual([['m/on', 'high']])
    expect(preferencesOf(catalog(), undefined, { 'm/on': 'medium' }).efforts.size).toBe(0)
  })

  it('ignores what does not belong to the catalog or is not a value of its kind', () => {
    const preferences = preferencesOf(
      catalog(),
      { llm: { 'm/elsewhere': true, 'm/off': 'yes' }, image: { 'm/off': true } },
      { 'm/elsewhere': 'low', 'm/on': 'max' },
    )
    expect(on(preferences)).toEqual({ llm: ['m/on'], decisions: [], live: [] })
    expect(preferences.efforts.size).toBe(0)
    expect(preferencesOf(catalog(), [true], 'high')).toEqual(
      preferencesOf(catalog(), undefined, undefined),
    )
    expect(preferencesOf(catalog(), null, null)).toEqual(
      preferencesOf(catalog(), undefined, undefined),
    )
  })
})
