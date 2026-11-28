import { describe, expect, it } from 'vitest'
import { defineFamily, RECORD_FACTS, recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  OPENAI_OWNER,
  OPENAI_REASONING_FORMAT,
  OPENAI_RECORDS,
  type OpenAiChatRecord,
  type OpenAiRecord,
  type OpenAiResponsesRecord,
} from '@omne-harness/pi-ai-openai'

// The models OpenAI serves through OpenRouter; the one it serves itself has its own block below.
const RECORDS: readonly OpenAiRecord[] = OPENAI_RECORDS.filter(
  record => record.route.provider === 'openrouter',
)
const DIRECT: readonly OpenAiRecord[] = OPENAI_RECORDS.filter(
  record => record.route.provider !== 'openrouter',
)
const CHAT_RECORDS = RECORDS.filter((record): record is OpenAiChatRecord => !('engine' in record))
const RESPONSES_RECORDS = RECORDS.filter(
  (record): record is OpenAiResponsesRecord => 'engine' in record,
)

const SEALED = {
  'openai/gpt-6-astra': ['astra', 'astra-patch', 'inherited'],
  'openai/gpt-6-astra-pro': ['astra', 'astra-patch', 'unknown'],
  'openai/gpt-6-sol': ['standard', 'sol-luna-auto-proxy', 'inherited'],
  'openai/gpt-6-sol-pro': ['standard', 'sol-luna-auto-proxy', 'unknown'],
  'openai/gpt-6-luna': ['standard', 'sol-luna-auto-proxy', 'inherited'],
  'openai/gpt-6-luna-pro': ['standard', 'sol-luna-auto-proxy', 'unknown'],
  'openai/gpt-5.6-sol': ['standard', 'gpt56-patch', 'inherited'],
  'openai/gpt-5.6-sol-pro': ['standard', 'gpt56-patch', 'unknown'],
  'openai/gpt-5.6-terra': ['standard', 'gpt56-patch', 'inherited'],
  'openai/gpt-5.6-terra-pro': ['standard', 'gpt56-patch', 'unknown'],
  'openai/gpt-5.6-luna': ['standard', 'gpt56-patch', 'inherited'],
  'openai/gpt-5.6-luna-pro': ['standard', 'gpt56-patch', 'unknown'],
} as const

const ADDED = {
  'openai/gpt-6.1-sol': ['astra', 'sol-luna-auto-proxy', 'inherited'],
  'openai/gpt-6.1-terra': ['standard', 'sol-luna-auto-proxy', 'inherited'],
  'openai/gpt-6.2-astra': ['astra', 'sol-luna-auto-proxy', 'inherited'],
  'openai/gpt-6.2-sol': ['astra', 'sol-luna-auto-proxy', 'inherited'],
} as const

const MODELS = { ...SEALED, ...ADDED }

// Each model at the revision of its current record; a record changes its revision when its data
// changes, so the adoption digest of an older revision never names new data.
const REVISIONS = {
  'openai/gpt-6.2-astra': '2',
  'openai/gpt-6-astra': '3',
  'openai/gpt-6.2-sol': '2',
  'openai/gpt-6.1-sol': '3',
  'openai/gpt-6-sol': '3',
  'openai/gpt-6.1-terra': '3',
  'openai/gpt-5.6-terra': '3',
  'openai/gpt-6-luna': '3',
  'openai/gpt-5.6-luna': '4',
  'openai/gpt-6-astra-pro': '1',
  'openai/gpt-6-sol-pro': '1',
  'openai/gpt-6-luna-pro': '1',
  'openai/gpt-5.6-sol': '1',
  'openai/gpt-5.6-sol-pro': '1',
  'openai/gpt-5.6-terra-pro': '1',
  'openai/gpt-5.6-luna-pro': '1',
} as const

const EFFORTS = {
  standard: ['none', 'low', 'medium', 'high', 'max'],
  astra: ['low', 'medium', 'high', 'max'],
} as const

function sealedOf(record: OpenAiRecord) {
  const sealed = Object.entries(MODELS).find(([name]) => name === record.name)?.[1]
  if (sealed === undefined) throw new Error(`no sealed or added row for ${record.name}`)
  return sealed
}

describe('the migrated models', () => {
  it('has one current record per model, at its revision, and nothing else', () => {
    expect(RECORDS.map(record => `${record.name}/${record.revision}`).toSorted()).toEqual(
      Object.entries(REVISIONS)
        .map(([name, revision]) => `${name}/${revision}`)
        .toSorted(),
    )
    expect(Object.keys(REVISIONS).toSorted()).toEqual(Object.keys(MODELS).toSorted())
    for (const record of RECORDS) {
      expect(record.status).toBe('current')
      expect(record.route).toEqual({ provider: 'openrouter', model: record.name })
    }
  })

  it.each(RECORDS.map(record => [record.name, record] as const))(
    '%s keeps its sealed image rule and, on chat-completions, its usage scope',
    (_name, record) => {
      const [, image, scope] = sealedOf(record)
      expect(record.meter.image).toBe(`${image}/1`)
      if ('engine' in record) expect(record).not.toHaveProperty('rules')
      else
        expect(record.rules.usage).toBe(scope === 'unknown' ? 'unknown-scope/1' : 'openai-usage/1')
    },
  )

  it.each(RECORDS.map(record => [record.name, record] as const))(
    '%s supports the sealed efforts except none, each written as itself',
    (_name, record) => {
      const rule = record.parameters['reasoning-effort']
      if (rule.support !== 'supported') throw new Error('reasoning effort must be supported')
      const supported = Object.entries(rule.wire)
        .filter(([, wire]) => wire !== 'unsupported')
        .map(([value]) => value)
      const sealed = EFFORTS[sealedOf(record)[0]].filter(value => value !== 'none')
      expect(rule.wire.none).toBe('unsupported')
      expect(supported.toSorted()).toEqual(sealed.toSorted())
      for (const [value, wire] of Object.entries(rule.wire))
        if (wire !== 'unsupported') expect(wire).toEqual({ field: 'reasoning.effort', value })
    },
  )

  it('says in the evidence of GPT-6.1 Terra and the two GPT-6.2 models that their image rule is an inference', () => {
    for (const name of ['openai/gpt-6.1-terra', 'openai/gpt-6.2-astra', 'openai/gpt-6.2-sol']) {
      const record = RECORDS.find(item => item.name === name)
      expect(record?.profile.evidence, name).toContain(
        'The image rule sol-luna-auto-proxy/1 is an inference',
      )
    }
    const sol = RECORDS.find(record => record.name === 'openai/gpt-6.1-sol')
    expect(sol?.profile.evidence).not.toContain('inference')
  })

  it('gives the two GPT-6.2 models the profile and meter of GPT-6.1 Sol, with the endpoint metadata of 2026-11-18', () => {
    const sol = RECORDS.find(record => record.name === 'openai/gpt-6.1-sol')
    if (sol === undefined) throw new Error('no GPT-6.1 Sol')
    for (const name of ['openai/gpt-6.2-astra', 'openai/gpt-6.2-sol']) {
      const record = RECORDS.find(item => item.name === name)
      expect(record?.meter, name).toEqual(sol.meter)
      expect({ ...record?.profile, evidence: '' }, name).toEqual({ ...sol.profile, evidence: '' })
      expect(record?.profile.evidence, name).toContain(
        `OpenRouter endpoint metadata observed 2026-11-18 for ${name}`,
      )
    }
  })

  it('turns the sealed parameter drops into explicit unsupported entries', () => {
    for (const record of RECORDS) {
      for (const kind of [
        'temperature',
        'top-p',
        'stop',
        'seed',
        'frequency-penalty',
        'presence-penalty',
      ] as const)
        expect(record.parameters[kind]).toEqual({ support: 'unsupported' })
      expect(record.parameters['max-output-tokens']).toEqual({
        support: 'supported',
        default: { kind: 'absent' },
        accept: { max: '128000' },
        wire: { field: 'max_tokens' },
      })
    }
  })

  it('keeps the sealed capabilities: text and image in, text out, 922000 input, 128000 output', () => {
    for (const record of RECORDS) {
      expect(record.profile.input).toEqual(['text', 'image'])
      expect(record.profile.output).toEqual(['text'])
      expect(record.profile.context.input?.provided).toBe('922000')
      expect(record.profile.context.output.provided).toBe('128000')
      expect(record.profile.context.window.provided).toBe('1050000')
      expect(record.profile.limits).toEqual([
        { metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } },
      ])
    }
  })
})

describe('the wire data', () => {
  it('puts the nine models of this run on the Responses interface and leaves the other seven on chat-completions', () => {
    expect(RESPONSES_RECORDS.map(record => record.name).toSorted()).toEqual(
      [
        'openai/gpt-6.2-astra',
        'openai/gpt-6-astra',
        'openai/gpt-6.2-sol',
        'openai/gpt-6.1-sol',
        'openai/gpt-6-sol',
        'openai/gpt-6.1-terra',
        'openai/gpt-5.6-terra',
        'openai/gpt-6-luna',
        'openai/gpt-5.6-luna',
      ].toSorted(),
    )
    expect(CHAT_RECORDS.map(record => record.name).toSorted()).toEqual(
      [
        'openai/gpt-6-astra-pro',
        'openai/gpt-6-sol-pro',
        'openai/gpt-6-luna-pro',
        'openai/gpt-5.6-sol',
        'openai/gpt-5.6-sol-pro',
        'openai/gpt-5.6-terra-pro',
        'openai/gpt-5.6-luna-pro',
      ].toSorted(),
    )
    for (const record of RESPONSES_RECORDS) expect(record.engine).toBe('responses')
  })

  it('pins OpenAI behind OpenRouter on chat-completions, writes the instruction as system and reminders as developer, compact content and store false', () => {
    for (const record of CHAT_RECORDS) {
      expect(record.serving).toEqual({ order: ['openai'], reports: ['OpenAI', 'openai'] })
      expect(record.wire.roles).toEqual({ instruction: 'system', reminder: 'developer' })
      expect(record.wire.content).toBe('compact')
      expect(record.wire.cache).toEqual({ kind: 'none' })
      expect(record.wire.fixed).toEqual([{ field: 'store', value: false }])
      expect(record.wire.image).toEqual({
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        detail: 'auto',
      })
      expect(record.extensions).toEqual([])
    }
  })

  it('pins the one OpenAI upstream on the Responses interface: a developer message, automatic caching keyed by the session, four image types, automatic summaries, 64-character tool names', () => {
    for (const record of RESPONSES_RECORDS) {
      expect(record.serving).toEqual({ order: ['openai'], reports: ['OpenAI'] })
      const { file, ...wire } = record.wire
      expect(file).toEqual(
        record.name === 'openai/gpt-5.6-luna'
          ? { mediaTypes: ['application/pdf'], maxBytes: 33554432 }
          : undefined,
      )
      expect(wire).toEqual({
        system: 'developer',
        cache: { kind: 'automatic' },
        image: { mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
        reasoning: { summary: 'auto' },
        toolNames: { rule: 'underscore/1', maxLength: 64 },
      })
      expect(record.extensions).toEqual([])
      expect(record.accepts).toEqual({ forcedToolChoice: true, endsWithAssistant: true })
    }
  })

  it('declares the default replay of each model and the reasoning format of its interface', () => {
    for (const record of CHAT_RECORDS) {
      expect(record.replay).toEqual({
        declaration: {},
        formats: { produces: 'openai-responses-v1', accepts: ['openai-responses-v1'] },
      })
      expect(record.rules.reasoning).toBe('openai-encrypted/1')
    }
    expect(OPENAI_REASONING_FORMAT).toBe('openai-responses-items-v1')
    for (const record of RESPONSES_RECORDS) {
      expect(record.replay.declaration).toEqual({})
      expect(record.replay.formats).toEqual({
        produces: 'openai-responses-items-v1',
        accepts: ['openai-responses-items-v1'],
      })
    }
  })

  it('binds the reasoning of the two GPT-6.2 models to the prefix and of the other seven to nothing', () => {
    expect(
      Object.fromEntries(RESPONSES_RECORDS.map(record => [record.name, record.replay.binding])),
    ).toEqual({
      'openai/gpt-6.2-astra': 'prefix',
      'openai/gpt-6-astra': 'none',
      'openai/gpt-6.2-sol': 'prefix',
      'openai/gpt-6.1-sol': 'none',
      'openai/gpt-6-sol': 'none',
      'openai/gpt-6.1-terra': 'none',
      'openai/gpt-5.6-terra': 'none',
      'openai/gpt-6-luna': 'none',
      'openai/gpt-5.6-luna': 'none',
    })
  })

  it.each(RESPONSES_RECORDS.map(record => [record.name, record] as const))(
    '%s cites for every fact its own stream on the Responses interface, measured 2026-11-18',
    (_name, record) => {
      const stream = `packages/model/pi-ai-openai/tests/fixtures/records/${encodeURIComponent(record.name)}/${record.revision}/stream.sse`
      expect(Object.keys(record.provenance).toSorted()).toEqual([...RECORD_FACTS].toSorted())
      for (const fact of RECORD_FACTS)
        expect(record.provenance[fact], fact).toMatchObject({
          measuredAt: '2026-11-18',
          evidence: stream,
        })
      for (const fact of [
        'efforts',
        'reasoning-off',
        'forced-tool-choice',
        'ends-with-assistant',
        'replay-binding',
        'cache',
        'system-placement',
      ] as const)
        expect(record.provenance[fact].note, fact).toMatch(/\S/u)
    },
  )

  it('names the o200k proxy tokenizer of this package', () => {
    for (const record of RECORDS) {
      expect(record.meter.tokenizer.adoption.owner).toBe(OPENAI_OWNER)
      expect(record.meter.tokenizer.implementation).toMatchObject({
        name: 'js-tiktoken',
        revision: '1.0.21',
      })
    }
  })
})

describe('purity and adoption', () => {
  it('the records are plain data that defineFamily accepts, with one digest each', () => {
    const acquire = async () =>
      ({ failure: { kind: 'unavailable', dependency: 'none', diagnostic: 'test' } }) as const
    expect(() => defineFamily({ owner: OPENAI_OWNER, records: RECORDS, acquire })).not.toThrow()
    const digests = RECORDS.map(record => recordAdoption(OPENAI_OWNER, record).digest)
    expect(new Set(digests).size).toBe(RECORDS.length)
  })

  it('a change of a rule name or of the evidence changes the adoption of a chat record', () => {
    const [record] = CHAT_RECORDS
    if (record === undefined) throw new Error('no chat record')
    const before = recordAdoption(OPENAI_OWNER, record).digest
    const rule: OpenAiChatRecord = {
      ...record,
      rules: {
        ...record.rules,
        usage: record.rules.usage === 'unknown-scope/1' ? 'openai-usage/1' : 'unknown-scope/1',
      },
    }
    const evidence: OpenAiChatRecord = {
      ...record,
      profile: { ...record.profile, evidence: 'other' },
    }
    expect(recordAdoption(OPENAI_OWNER, rule).digest).not.toBe(before)
    expect(recordAdoption(OPENAI_OWNER, evidence).digest).not.toBe(before)
  })

  it('a change of the replay binding, of what the model accepts or of a source changes the adoption of a Responses record', () => {
    const [record] = RESPONSES_RECORDS
    if (record === undefined) throw new Error('no Responses record')
    const before = recordAdoption(OPENAI_OWNER, record).digest
    const binding: OpenAiResponsesRecord = {
      ...record,
      replay: { ...record.replay, binding: record.replay.binding === 'prefix' ? 'none' : 'prefix' },
    }
    const accepts: OpenAiResponsesRecord = {
      ...record,
      accepts: { ...record.accepts, endsWithAssistant: !record.accepts.endsWithAssistant },
    }
    const source: OpenAiResponsesRecord = {
      ...record,
      provenance: {
        ...record.provenance,
        cache: { ...record.provenance.cache, measuredAt: '2026-11-19' },
      },
    }
    expect(recordAdoption(OPENAI_OWNER, binding).digest).not.toBe(before)
    expect(recordAdoption(OPENAI_OWNER, accepts).digest).not.toBe(before)
    expect(recordAdoption(OPENAI_OWNER, source).digest).not.toBe(before)
  })
})

describe('the model OpenAI serves itself', () => {
  it('is gpt-6-luna alone, current at revision 1, on the Responses interface with no gateway pin', () => {
    expect(
      DIRECT.map(record => [record.name, record.revision, record.status, record.route]),
    ).toEqual([['gpt-6-luna', '1', 'current', { provider: 'openai', model: 'gpt-6-luna' }]])
    const [luna] = DIRECT
    if (luna === undefined || !('engine' in luna)) throw new Error('no direct Responses record')
    expect(luna.serving).toBeNull()
    expect(luna.wire).toEqual({
      system: 'developer',
      cache: { kind: 'automatic' },
      image: { mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
      reasoning: { summary: 'auto' },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    })
    expect(luna.accepts).toEqual({ forcedToolChoice: true, endsWithAssistant: true })
    expect(luna.replay.binding).toBe('none')
    expect(luna.parameters).toEqual(
      OPENAI_RECORDS.find(r => r.name === 'openai/gpt-6-luna')?.parameters,
    )
  })

  it('cites for every fact its own stream at OpenAI, measured 2026-11-27, and says how the stream ends', () => {
    const [luna] = DIRECT
    if (luna === undefined || !('engine' in luna)) throw new Error('no direct Responses record')
    const evidence = 'packages/model/pi-ai-openai/tests/fixtures/records/gpt-6-luna/1/stream.sse'
    expect(Object.keys(luna.provenance).toSorted()).toEqual([...RECORD_FACTS].toSorted())
    for (const fact of RECORD_FACTS)
      expect(luna.provenance[fact]).toMatchObject({ measuredAt: '2026-11-27', evidence })
    expect(luna.provenance.engine.note).toContain('with no end marker')
    expect(luna.provenance['usage-fields'].note).toContain('no cost')
  })
})
