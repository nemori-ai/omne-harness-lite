import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/json-text'
import type { ReasoningEffortMapping } from '@omne-harness/model-contract'
import type { ModelTextTokenizer } from '@omne-harness/model-contract/provider'
import { bindChatCompletions } from '../src/chat-completions/index.ts'
import type { ProjectedRequest } from '../src/chat-completions/index.ts'
import {
  byteLimitOf,
  chatRepresentation,
  chatTextHooks,
  chatUnitsOf,
  componentAdoption,
  countingBasis,
  createGatewayMeter,
  defineGatewayFamily,
  O200K_PROXY_TOKENIZER,
  memberOf,
  obj,
  officialProfilesOf,
  optionalImageBytes,
  str,
  tileImageTokens,
  type GatewayFamilyConfig,
  type ProfileData,
} from '../src/family-kit/index.ts'
import { composeFamilies, recordAdoption } from '../src/index.ts'
import { TEST_DECODER_LIMITS } from '../src/testing/index.ts'
import {
  adoption,
  engineProbe,
  OWNER,
  supplierOf,
  testHooks,
  testRecord,
} from './support/chat-record.ts'

const PROFILE: ProfileData = {
  input: ['text', 'image'],
  output: ['text'],
  context: {
    window: { provided: '1000', upstream: { kind: 'finite', amount: '1200' } },
    input: null,
    output: { provided: '100', upstream: { kind: 'unknown' } },
  },
  limits: [{ metric: 'image-bytes', provided: '4096', upstream: { kind: 'unknown' } }],
  evidence: 'tests',
}

function kitRecord(overrides: object = {}) {
  return {
    ...testRecord(),
    profile: PROFILE,
    meter: { tokenizer: O200K_PROXY_TOKENIZER },
    ...overrides,
  }
}

const INPUT = { retryPolicy: adoption('retry'), compactionTriggerPercent: '80' }
const EFFORTS = (): ReasoningEffortMapping => ({ low: 'low' })

describe('officialProfilesOf', () => {
  it('projects every current record in order and leaves frozen records out', () => {
    const first = kitRecord({ name: 'model-a' })
    const frozen = kitRecord({ name: 'model-b', status: 'frozen' })
    const third = kitRecord({ name: 'model-c' })
    const profiles = officialProfilesOf(OWNER, [first, frozen, third], INPUT, EFFORTS)
    expect(profiles.map(profile => profile.suppliers[0].adoption.name)).toEqual([
      'model-a',
      'model-c',
    ])
  })

  it('writes the record’s facts as a profile, field by field and in order', () => {
    const record = kitRecord()
    const [profile] = officialProfilesOf(OWNER, [record], INPUT, EFFORTS)
    const supplier = recordAdoption(OWNER, record)
    const evidence = { ...supplier, name: 'model-a#evidence' }
    expect(profile).toEqual({
      suppliers: [{ adoption: supplier, provider: 'gateway', model: 'lab/model-a', replay: {} }],
      fallback: false,
      input: ['text', 'image'],
      output: ['text'],
      context: {
        window: {
          provided: '1000',
          upstream: [{ supplier, limit: { kind: 'finite', amount: '1200', source: evidence } }],
        },
        input: null,
        output: { provided: '100', upstream: [{ supplier, limit: { kind: 'unknown' } }] },
        compactionTriggerPercent: '80',
      },
      limits: [
        {
          metric: 'image-bytes',
          provided: '4096',
          upstream: [{ supplier, limit: { kind: 'unknown' } }],
        },
      ],
      parameters: [],
      reasoningEfforts: { low: 'low' },
      representation: { ...supplier, name: 'model-a#representation' },
      meter: { ...supplier, name: 'model-a#meter' },
      retryPolicy: adoption('retry'),
    })
    expect(Object.keys(profile ?? {})).not.toContain('fileTypes')
  })

  it('declares the file types right after the input modalities when the wire takes files', () => {
    const wire = { ...testRecord().wire, file: { mediaTypes: ['application/pdf'], maxBytes: 9 } }
    const context = { window: PROFILE.context.window, input: PROFILE.context.window }
    const record = kitRecord({
      wire,
      profile: { ...PROFILE, context: { ...PROFILE.context, ...context } },
    })
    const [profile] = officialProfilesOf(OWNER, [record], INPUT, EFFORTS)
    expect(Object.keys(profile ?? {}).slice(2, 5)).toEqual(['input', 'fileTypes', 'output'])
    expect(profile?.fileTypes).toEqual(['application/pdf'])
    expect(profile?.context.input).toEqual(profile?.context.window)
  })

  it('accepts a compaction trigger from 1 to 100 percent and nothing else', () => {
    for (const percent of ['1', '9', '10', '99', '100'])
      expect(() =>
        officialProfilesOf(OWNER, [], { ...INPUT, compactionTriggerPercent: percent }, EFFORTS),
      ).not.toThrow()
    for (const percent of ['0', '101', '08', '1.5', '', ' 80', 80])
      expect(() =>
        officialProfilesOf(
          OWNER,
          [],
          { ...INPUT, compactionTriggerPercent: percent as string },
          EFFORTS,
        ),
      ).toThrow('compactionTriggerPercent must be a decimal integer from 1 to 100')
  })
})

describe('component adoptions', () => {
  it('names a component after its record, under the family owner and the record digest', () => {
    const record = kitRecord()
    const { digest } = recordAdoption(OWNER, record)
    expect(componentAdoption(OWNER, record, 'media')).toEqual({
      owner: OWNER,
      name: 'model-a#media',
      revision: '1',
      digest,
    })
  })

  it('counts with the record’s own tokenizer and one component per counting step', () => {
    const record = kitRecord()
    const part = (component: string) => ({
      ...recordAdoption(OWNER, record),
      name: `model-a#${component}`,
    })
    expect(countingBasis(OWNER, record)).toEqual({
      supplier: {
        adoption: recordAdoption(OWNER, record),
        provider: 'gateway',
        model: 'lab/model-a',
        replay: {},
      },
      meter: part('meter'),
      tokenization: { kind: 'local', definition: O200K_PROXY_TOKENIZER },
      prompt: { kind: 'provider-private', estimation: part('prompt') },
      projection: part('projection'),
      mediaTransform: part('media'),
      replay: part('replay'),
      evidence: part('evidence'),
    })
  })
})

describe('limits', () => {
  it('reads one metric’s byte limit, or nothing when the profile declares none', () => {
    expect(byteLimitOf(kitRecord(), 'image-bytes')).toBe(4096)
    expect(byteLimitOf(kitRecord(), 'voice-bytes')).toBeUndefined()
  })

  it('takes images only when wire, profile, limit and meter rule all agree', () => {
    const rule = { tilePixels: '28', tokensPerTile: '1', overheadTokens: '0' }
    const tokenizer = O200K_PROXY_TOKENIZER
    expect(optionalImageBytes(kitRecord({ meter: { tokenizer, image: rule } }))).toEqual({
      imageBytes: 4096,
    })
    const text = { ...PROFILE, input: ['text'] as const, limits: [] }
    const wire = { ...testRecord().wire, image: null }
    expect(optionalImageBytes(kitRecord({ wire, profile: text }))).toEqual({})
    for (const broken of [
      kitRecord(),
      kitRecord({ wire, meter: { tokenizer, image: rule } }),
      kitRecord({ profile: { ...PROFILE, input: ['text'] }, meter: { tokenizer, image: rule } }),
      kitRecord({ profile: { ...PROFILE, limits: [] }, meter: { tokenizer, image: rule } }),
    ])
      expect(() => optionalImageBytes(broken)).toThrow('inconsistent image support')
    const voiceOnly = [{ metric: 'voice-bytes', provided: '10', upstream: { kind: 'unknown' } }]
    expect(() =>
      optionalImageBytes(
        kitRecord({
          profile: { ...PROFILE, limits: voiceOnly },
          meter: { tokenizer, image: rule },
        }),
      ),
    ).toThrow('inconsistent image support')
    for (const provided of ['0', '-1', '1.5', 'x'])
      expect(() =>
        optionalImageBytes(
          kitRecord({
            profile: { ...PROFILE, limits: [{ ...PROFILE.limits[0], provided }] },
            meter: { tokenizer, image: rule },
          }),
        ),
      ).toThrow('invalid image byte limit')
  })
})

describe('chatTextHooks', () => {
  it('accepts an object schema unchanged and refuses any other root', () => {
    const record = kitRecord()
    const hooks = chatTextHooks(OWNER, record)
    const plain: JsonValue = { kind: 'object', entries: [{ key: 'b', value: { kind: 'null' } }] }
    expect(hooks.toolSchema(plain)).toEqual({ ok: plain })
    expect(hooks.toolSchema({ kind: 'array', items: [] })).toEqual({
      failure: {
        kind: 'unsupported',
        field: 'argumentsSchema',
        adapter: recordAdoption(OWNER, record),
      },
    })
    expect(hooks.check({ applied: [], treatments: [] } as never)).toStrictEqual({ ok: undefined })
    expect(hooks.reasoning).not.toBeNull()
  })
})

function view(overrides: Partial<ProjectedRequest> = {}): ProjectedRequest {
  return {
    instruction: [{ kind: 'text', text: 'rules' }],
    turns: [],
    tools: [],
    toolChoice: 'auto',
    applied: [],
    ...overrides,
  } as ProjectedRequest
}

const json = (value: JsonValue): unknown =>
  value.kind === 'object'
    ? Object.fromEntries(value.entries.map(entry => [entry.key, json(entry.value)]))
    : value.kind === 'array'
      ? value.items.map(json)
      : value.kind === 'string'
        ? value.value
        : value.kind === 'number'
          ? value.lexeme
          : value

describe('chatRepresentation and chatUnitsOf', () => {
  const turn = (blocks: readonly unknown[], replay: unknown = { kind: 'none' }) => ({
    role: 'user',
    message: 'm1',
    blocks,
    replay,
  })
  const picture = { kind: 'image', mediaType: 'image/png' }
  const file = { kind: 'file' }

  it('writes the instruction first under the record’s role, then one unit per message', () => {
    const shape = { instructionRole: 'system', imageDetail: 'low', files: true }
    const request = view({
      turns: [
        turn([{ kind: 'text', text: 'hi' }, picture, file], { kind: 'plain', text: 'why' }),
      ] as never,
      tools: [
        {
          name: 'grep',
          description: 'search',
          argumentsSchema: { kind: 'object', entries: [] },
        },
      ] as never,
      toolChoice: { name: 'grep' } as never,
    })
    const { tokenInput, units } = chatRepresentation(request, shape)
    expect(units).toEqual([null, 'm1'])
    expect(json(tokenInput)).toEqual({
      messages: [
        { role: 'system', content: [{ type: 'text', text: 'rules' }] },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hi' },
            { type: 'image', mediaType: 'image/png', detail: 'low' },
            { type: 'file' },
          ],
          reasoning: 'why',
        },
      ],
      tools: [{ name: 'grep', description: 'search', parameters: {} }],
      tool_choice: { name: 'grep' },
      parameters: '[]',
    })
    expect(chatUnitsOf(tokenInput, ['low'])).toEqual([
      { images: [], files: false, reasoning: false },
      { images: [{ detail: 'low' }], files: true, reasoning: false },
    ])
    expect(chatUnitsOf(tokenInput, ['auto'])).toBeNull()
    expect(chatUnitsOf(tokenInput)).toEqual([
      { images: [], files: false, reasoning: false },
      { images: [{ detail: '' }], files: true, reasoning: false },
    ])
  })

  it('leaves out images and files the record does not take, and an empty instruction', () => {
    const shape = { instructionRole: 'system', imageDetail: null, files: false }
    const details = { kind: 'details', details: [{}, {}] }
    const { tokenInput, units } = chatRepresentation(
      view({ instruction: [], turns: [turn([picture, file], details)] as never }),
      shape,
    )
    expect(units).toEqual(['m1'])
    expect(json(tokenInput)).toMatchObject({
      messages: [{ role: 'user', content: [], reasoning_details: { opaque: '2' } }],
      tool_choice: 'auto',
    })
    expect(chatUnitsOf(tokenInput)).toEqual([{ images: [], files: false, reasoning: true }])
  })

  it('cannot read back a request that is not shaped as messages of typed parts', () => {
    const str = (value: string): JsonValue => ({ kind: 'string', value })
    const obj = (entries: Record<string, JsonValue>): JsonValue => ({
      kind: 'object',
      entries: Object.entries(entries).map(([key, value]) => ({ key, value })),
    })
    const arr = (items: JsonValue[]): JsonValue => ({ kind: 'array', items })
    expect(chatUnitsOf(obj({}))).toBeNull()
    expect(chatUnitsOf(obj({ messages: arr([obj({})]) }))).toBeNull()
    expect(chatUnitsOf(obj({ messages: arr([obj({ content: arr([obj({})]) })]) }))).toBeNull()
    expect(chatUnitsOf(str('x'))).toBeNull()
  })
})

const TOKENIZER: ModelTextTokenizer = {
  definition: O200K_PROXY_TOKENIZER,
  count: async () => ({ ok: { tokens: '1' } }),
} as unknown as ModelTextTokenizer

describe('defineGatewayFamily', () => {
  const margin = { percent: '10', source: adoption('margin') }
  function familyWith(config: Partial<GatewayFamilyConfig> = {}, fail = false) {
    let released = 0
    const base: GatewayFamilyConfig = {
      tokenizer: { definition: O200K_PROXY_TOKENIZER },
      executor: {
        acquire: () => ({
          ok: {
            tokenizer: TOKENIZER,
            release: async () => {
              released += 1
              return fail
                ? { failure: { kind: 'unavailable', diagnostic: 'x' } }
                : { ok: undefined }
            },
          },
        }),
      },
      limits: TEST_DECODER_LIMITS,
      margin,
    }
    const merged = { ...base, ...config }
    const record = kitRecord()
    const family = defineGatewayFamily({
      owner: OWNER,
      title: 'Lab',
      records: [record],
      config: merged,
      bind(bound, input) {
        if (bound.name !== 'model-a') throw new Error('wrong record')
        return bindChatCompletions({
          record: bound,
          bindingEfforts: {},
          supplier: input.supplier,
          hooks: testHooks(engineProbe()),
          meter: createGatewayMeter({
            owner: OWNER,
            record: bound,
            tokenizer: input.tokenizer,
            margin,
            outputGroup: 'group',
            uncountable: 'none',
            form: 'as-written',
            contentOf: tokenInput => chatUnitsOf(tokenInput),
            imageTokens: ({ units }) => ({ ok: units.map(() => 0n) }),
            represent: request =>
              chatRepresentation(request, {
                instructionRole: 'system',
                imageDetail: null,
                files: false,
              }),
          }),
          limits: merged.limits,
          release: input.release,
        })
      },
    })
    return { family, record, released: () => released }
  }
  const live = () => new AbortController().signal

  it('refuses a configuration no binding could use, naming the family', () => {
    expect(() => familyWith({ margin: { ...margin, percent: '1.5' } })).toThrow(
      'config.margin.percent must be a non-negative decimal integer',
    )
    expect(() => familyWith({ margin: null as never })).toThrow('config.margin must be an object')
    expect(() => familyWith({ limits: null as never })).toThrow('config.limits must be')
    expect(() => familyWith({ executor: {} as never })).toThrow('config.executor must acquire')
    expect(() => familyWith({ tokenizer: null as never })).toThrow('config.tokenizer must be')
    expect(() =>
      defineGatewayFamily({
        owner: OWNER,
        title: 'Lab',
        records: [],
        config: null as never,
        bind: () => {
          throw new Error()
        },
      }),
    ).toThrow('the Lab family configuration must be an object')
    expect(() =>
      defineGatewayFamily({
        owner: OWNER,
        title: 'Lab',
        records: [],
        config: 'x' as never,
        bind: () => {
          throw new Error()
        },
      }),
    ).toThrow('the Lab family configuration must be an object')
    expect(() => familyWith({ tokenizer: 'x' as never })).toThrow('config.tokenizer must be')
    expect(() => familyWith({ executor: undefined as never })).toThrow(RangeError)
    expect(() => familyWith({ limits: 'x' as never })).toThrow('config.limits must be')
    expect(() => familyWith({ margin: 'x' as never })).toThrow('config.margin must be an object')
    expect(() => familyWith({ margin: { ...margin, percent: 5 as never } })).toThrow(
      'config.margin.percent',
    )
    expect(() => familyWith({ margin: { ...margin, percent: '100' } })).not.toThrow()
  })

  it('binds only the exact tokenizer the record names: every part, every field', async () => {
    const parts = ['adoption', 'implementation', 'vocabulary', 'configuration'] as const
    const fields = ['owner', 'name', 'revision', 'digest'] as const
    for (const part of parts)
      for (const field of fields) {
        const definition = {
          ...O200K_PROXY_TOKENIZER,
          [part]: { ...O200K_PROXY_TOKENIZER[part], [field]: 'changed' },
        }
        const { family, record } = familyWith({ tokenizer: { definition } })
        expect(await composeFamilies([family]).acquire(supplierOf(record), live())).toMatchObject({
          failure: { diagnostic: 'tokenizer-definition-mismatch' },
        })
      }
  })

  it('binds a record with a tokenizer lease that the binding returns on release', async () => {
    const { family, record, released } = familyWith()
    const acquired = await composeFamilies([family]).acquire(supplierOf(record), live())
    if (!('ok' in acquired)) throw new Error(JSON.stringify(acquired.failure))
    expect(acquired.ok.adoption).toEqual(recordAdoption(OWNER, record))
    expect(released()).toBe(0)
    await acquired.ok.release()
    expect(released()).toBe(1)
  })

  it('answers unavailable for another tokenizer, a cancelled acquire, and a refused lease', async () => {
    const other = { ...O200K_PROXY_TOKENIZER, configuration: adoption('other') }
    const mismatch = familyWith({ tokenizer: { definition: other } })
    expect(
      await composeFamilies([mismatch.family]).acquire(supplierOf(mismatch.record), live()),
    ).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: OWNER,
        diagnostic: 'tokenizer-definition-mismatch',
      },
    })
    const controller = new AbortController()
    controller.abort()
    const { family, record } = familyWith()
    expect(await composeFamilies([family]).acquire(supplierOf(record), controller.signal)).toEqual({
      failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'cancelled' },
    })
    const refused = familyWith({
      executor: {
        acquire: () => ({ failure: { kind: 'overloaded', diagnostic: 'busy' } as never }),
      },
    })
    expect(
      await composeFamilies([refused.family]).acquire(supplierOf(refused.record), live()),
    ).toEqual({
      failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'tokenizer-overloaded' },
    })
  })

  it('answers cancelled when the acquire is cancelled after the table admitted it, before any lease', async () => {
    let reads = 0
    const signal: AbortSignal = Object.create(AbortSignal.prototype, {
      aborted: { get: () => reads++ > 0 },
    })
    const { family, record, released } = familyWith()
    expect(await composeFamilies([family]).acquire(supplierOf(record), signal)).toEqual({
      failure: { kind: 'unavailable', dependency: OWNER, diagnostic: 'cancelled' },
    })
    expect(released()).toBe(0)
  })

  it('returns the lease when binding throws, and reports a lease that fails to return', async () => {
    const throwing = familyWith({ limits: { ...TEST_DECODER_LIMITS, maxReasoningText: 0 } })
    await expect(
      composeFamilies([throwing.family]).acquire(supplierOf(throwing.record), live()),
    ).rejects.toThrow(RangeError)
    expect(throwing.released()).toBe(1)
    const failing = familyWith({}, true)
    const acquired = await composeFamilies([failing.family]).acquire(
      supplierOf(failing.record),
      live(),
    )
    if (!('ok' in acquired)) throw new Error(JSON.stringify(acquired.failure))
    await expect(acquired.ok.release()).rejects.toThrow('tokenizer-unavailable')
  })
})

describe('the parts of a chat representation', () => {
  const shape = { instructionRole: 'system', imageDetail: 'high', files: false }
  const turnOf = (blocks: readonly unknown[]) => ({
    role: 'assistant',
    message: 'm',
    blocks,
    replay: { kind: 'none' },
  })

  it('writes each part kind the meter counts, and nothing for the parts it does not', () => {
    const blocks = [
      { kind: 'image', ref: { mediaType: 'image/jpeg' } },
      { kind: 'tool_call', callId: 'c1', name: 'grep', arguments: { kind: 'null' } },
      { kind: 'tool_call_unparsed', callId: 'c2', name: 'grep', raw: '{oops' },
      { kind: 'tool_result', callId: 'c1' },
      { kind: 'thinking' },
      { kind: 'tool_call_incomplete' },
      { kind: 'voice' },
      { kind: 'file' },
    ]
    const { tokenInput } = chatRepresentation(
      view({
        instruction: [{ kind: 'image' }, { kind: 'text', text: 'rules' }] as never,
        turns: [turnOf(blocks)] as never,
      }),
      shape,
    )
    expect(memberOf(tokenInput, 'messages')).toEqual({
      kind: 'array',
      items: [
        obj({
          role: str('system'),
          content: { kind: 'array', items: [obj({ type: str('text'), text: str('rules') })] },
        }),
        obj({
          role: str('assistant'),
          content: {
            kind: 'array',
            items: [
              obj({ type: str('image'), mediaType: str('image/jpeg'), detail: str('high') }),
              obj({
                type: str('tool_call'),
                id: str('c1'),
                name: str('grep'),
                arguments: str('null'),
              }),
              obj({
                type: str('tool_call'),
                id: str('c2'),
                name: str('grep'),
                arguments: str('{oops'),
              }),
              obj({ type: str('tool_result'), id: str('c1') }),
            ],
          },
        }),
      ],
    })
    expect(memberOf(tokenInput, 'tool_choice')).toEqual(str('auto'))
    const named = chatRepresentation(view({ toolChoice: { name: 'grep' } } as never), shape)
    expect(memberOf(named.tokenInput, 'tool_choice')).toEqual(obj({ name: str('grep') }))
  })

  it('drops an undefined member and keeps the order of the others', () => {
    expect(obj({ a: str('1'), b: undefined, c: str('3') })).toEqual({
      kind: 'object',
      entries: [
        { key: 'a', value: str('1') },
        { key: 'c', value: str('3') },
      ],
    })
  })

  it('cannot read an image whose detail is missing when the details are checked', () => {
    const input = obj({
      messages: {
        kind: 'array',
        items: [obj({ content: { kind: 'array', items: [obj({ type: str('image') })] } })],
      },
    })
    expect(chatUnitsOf(input, ['auto'])).toBeNull()
    expect(chatUnitsOf(input)).toEqual([
      { images: [{ detail: '' }], files: false, reasoning: false },
    ])
  })
})

describe('the image tile rule', () => {
  const image = (width: string, height: string) =>
    ({ kind: 'image', widthPixels: width, heightPixels: height }) as never
  it('accepts multi-digit rates and refuses malformed ones by name', () => {
    const rule = { tilePixels: '28', tokensPerTile: '1', overheadTokens: '16' }
    expect(
      tileImageTokens(OWNER, rule, [{ images: [null], files: false }], [image('56', '28')]),
    ).toEqual({
      ok: [18n],
    })
    expect(() =>
      tileImageTokens(
        OWNER,
        { ...rule, overheadTokens: 'x' },
        [{ images: [null], files: false }],
        [image('1', '1')],
      ),
    ).toThrow('invalid image token rule')
  })
})
