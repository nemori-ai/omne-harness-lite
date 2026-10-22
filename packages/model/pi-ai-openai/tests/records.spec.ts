// The record table: the migrated facts of the sealed family policy, the shared wire data, and the
// purity that the adoption digest relies on.
import { describe, expect, it } from 'vitest'
import { defineFamily, recordAdoption } from '@omne-harness/pi-ai-transport'
import { OPENAI_OWNER, OPENAI_RECORDS, type OpenAiRecord } from '@omne-harness/pi-ai-openai'

const RECORDS: readonly OpenAiRecord[] = OPENAI_RECORDS

/**
 * The sealed `openAiFamilyRecords` (openai-family-policy.ts:178-271): effort set, image rule and
 * input scope of each model.
 */
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

const EFFORTS = {
  standard: ['none', 'low', 'medium', 'high', 'max'],
  astra: ['low', 'medium', 'high', 'max'],
} as const

function sealedOf(record: OpenAiRecord) {
  const sealed = Object.entries(SEALED).find(([name]) => name === record.name)?.[1]
  if (sealed === undefined) throw new Error(`no sealed row for ${record.name}`)
  return sealed
}

describe('the migrated models', () => {
  it('has one current record at revision 1 per sealed model, and nothing else', () => {
    expect(RECORDS.map(record => record.name).toSorted()).toEqual(Object.keys(SEALED).toSorted())
    for (const record of RECORDS) {
      expect(record.revision).toBe('1')
      expect(record.status).toBe('current')
      expect(record.route).toEqual({ recipient: 'openrouter', model: record.name })
    }
  })

  it.each(RECORDS.map(record => [record.name, record] as const))(
    '%s keeps its sealed image rule and usage scope',
    (_name, record) => {
      const [, image, scope] = sealedOf(record)
      expect(record.meter.image).toBe(`${image}/1`)
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
      // The project convention: a record never turns reasoning off, so `none` is never offered.
      const sealed = EFFORTS[sealedOf(record)[0]].filter(value => value !== 'none')
      expect(rule.wire.none).toBe('unsupported')
      expect(supported.toSorted()).toEqual(sealed.toSorted())
      for (const [value, wire] of Object.entries(rule.wire))
        if (wire !== 'unsupported') expect(wire).toEqual({ field: 'reasoning.effort', value })
    },
  )

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
  it('pins OpenAI behind OpenRouter, writes developer roles, compact content and store false', () => {
    for (const record of RECORDS) {
      expect(record.serving).toEqual({ order: ['openai'], reports: ['OpenAI', 'openai'] })
      expect(record.wire.roles).toEqual({ instruction: 'developer', reminder: 'developer' })
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

  it('declares the default replay of each model and the OpenAI reasoning format', () => {
    for (const record of RECORDS) {
      expect(record.replay).toEqual({
        declaration: {},
        formats: { produces: 'openai-responses-v1', accepts: ['openai-responses-v1'] },
      })
      expect(record.rules.reasoning).toBe('openai-encrypted/1')
    }
  })

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

  it('a change of a rule name or of the evidence changes the adoption', () => {
    const [record] = RECORDS
    if (record === undefined) throw new Error('no record')
    const before = recordAdoption(OPENAI_OWNER, record).digest
    const rule: OpenAiRecord = { ...record, rules: { ...record.rules, usage: 'unknown-scope/1' } }
    const evidence: OpenAiRecord = { ...record, profile: { ...record.profile, evidence: 'other' } }
    expect(recordAdoption(OPENAI_OWNER, rule).digest).not.toBe(before)
    expect(recordAdoption(OPENAI_OWNER, evidence).digest).not.toBe(before)
  })
})
