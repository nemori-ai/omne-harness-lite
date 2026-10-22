// The record table: the migrated facts of the sealed Anthropic definitions and replay policy, the
// shared wire data, and the purity that the adoption digest relies on.
import { describe, expect, it } from 'vitest'
import { defineFamily, recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  ANTHROPIC_OWNER,
  ANTHROPIC_RECORDS,
  type AnthropicRecord,
} from '@omne-harness/pi-ai-anthropic'

const RECORDS: readonly AnthropicRecord[] = ANTHROPIC_RECORDS

/** The sealed `anthropicReplayModels` (anthropic-replay.ts:28-33): the signed-prefix models. */
const SEALED_PREFIX = {
  'anthropic/claude-opus-5.5': true,
  'anthropic/claude-opus-5': false,
  'anthropic/claude-sonnet-5': false,
  'anthropic/claude-fable-5.1': true,
} as const

function sealedPrefix(record: AnthropicRecord): boolean {
  const sealed = Object.entries(SEALED_PREFIX).find(([name]) => name === record.name)?.[1]
  if (sealed === undefined) throw new Error(`no sealed row for ${record.name}`)
  return sealed
}

describe('the migrated models', () => {
  it('has one current record at revision 1 per sealed model, and nothing else', () => {
    expect(RECORDS.map(record => record.name).toSorted()).toEqual(
      Object.keys(SEALED_PREFIX).toSorted(),
    )
    for (const record of RECORDS) {
      expect(record.revision).toBe('1')
      expect(record.status).toBe('current')
      expect(record.route).toEqual({ recipient: 'openrouter', model: record.name })
    }
  })

  it.each(RECORDS.map(record => [record.name, record] as const))(
    '%s degrades to reasoning off exactly when the sealed policy requires a signed prefix',
    (_name, record) => {
      expect(record.replay.prefix).toEqual(
        sealedPrefix(record)
          ? { kind: 'last-tool-turn', degrade: 'disable-reasoning' }
          : { kind: 'none' },
      )
    },
  )

  it('offers the sealed efforts low to max as themselves, and not none', () => {
    for (const record of RECORDS) {
      const rule = record.parameters['reasoning-effort']
      if (rule.support !== 'supported') throw new Error('reasoning effort must be supported')
      expect(rule.wire).toEqual({
        none: 'unsupported',
        low: { field: 'reasoning.effort', value: 'low' },
        medium: { field: 'reasoning.effort', value: 'medium' },
        high: { field: 'reasoning.effort', value: 'high' },
        max: { field: 'reasoning.effort', value: 'max' },
      })
      expect(rule.default).toEqual({ kind: 'absent' })
    }
  })

  it('passes the output limit and stop sequences and turns the sealed drops into unsupported', () => {
    for (const record of RECORDS) {
      for (const kind of [
        'temperature',
        'top-p',
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
      expect(record.parameters.stop).toMatchObject({
        support: 'supported',
        default: { kind: 'absent' },
        wire: { field: 'stop' },
      })
    }
  })

  it('keeps the sealed capabilities: text and image in, text out, 872000 input, 128000 output', () => {
    for (const record of RECORDS) {
      expect(record.profile.input).toEqual(['text', 'image'])
      expect(record.profile.output).toEqual(['text'])
      expect(record.profile.context).toEqual({
        window: { provided: '1000000', upstream: { kind: 'unknown' } },
        input: { provided: '872000', upstream: { kind: 'unknown' } },
        output: { provided: '128000', upstream: { kind: 'unknown' } },
      })
      expect(record.profile.limits).toEqual([
        { metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } },
      ])
    }
  })
})

describe('the wire data', () => {
  it('pins Anthropic behind OpenRouter: system instruction, user reminder, parts, 1h cache, store false', () => {
    for (const record of RECORDS) {
      expect(record.serving).toEqual({ order: ['anthropic'], reports: ['Anthropic', 'anthropic'] })
      expect(record.wire.roles).toEqual({ instruction: 'system', reminder: 'user' })
      expect(record.wire.content).toBe('parts')
      expect(record.wire.cache).toEqual({ kind: 'last-message', ttl: '1h' })
      expect(record.wire.fixed).toEqual([{ field: 'store', value: false }])
      expect(record.wire.image).toEqual({
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        detail: 'auto',
      })
      expect(record.extensions).toEqual([])
    }
  })

  it('declares the default replay of each model and the Anthropic reasoning format', () => {
    for (const record of RECORDS) {
      expect(record.replay.declaration).toEqual({})
      expect(record.replay.formats).toEqual({
        produces: 'anthropic-claude-v1',
        accepts: ['anthropic-claude-v1'],
      })
      expect(record.rules.reasoning).toBe('anthropic-signed-group/1')
    }
  })

  it('names the legacy Claude BPE of this package as an estimate tokenizer', () => {
    for (const record of RECORDS) {
      expect(record.meter.text).toBe('claude-legacy-bpe-estimate/1')
      expect(record.meter.tokenizer.adoption.owner).toBe(ANTHROPIC_OWNER)
      expect(record.meter.tokenizer.implementation).toMatchObject({
        name: 'js-tiktoken',
        revision: '1.0.21',
      })
      expect(record.meter.tokenizer.vocabulary).toMatchObject({ name: 'claude.json' })
    }
  })
})

describe('purity and adoption', () => {
  it('the records are plain data that defineFamily accepts, with one digest each', () => {
    const acquire = async () =>
      ({ failure: { kind: 'unavailable', dependency: 'none', diagnostic: 'test' } }) as const
    expect(() =>
      defineFamily({ owner: ANTHROPIC_OWNER, records: RECORDS, acquire }),
    ).not.toThrow()
    const digests = RECORDS.map(record => recordAdoption(ANTHROPIC_OWNER, record).digest)
    expect(new Set(digests).size).toBe(RECORDS.length)
  })

  it('a change of the prefix rule or of the evidence changes the adoption', () => {
    const [record] = RECORDS
    if (record === undefined) throw new Error('no record')
    const before = recordAdoption(ANTHROPIC_OWNER, record).digest
    const prefix: AnthropicRecord = {
      ...record,
      replay: { ...record.replay, prefix: { kind: 'none' } },
    }
    const evidence: AnthropicRecord = {
      ...record,
      profile: { ...record.profile, evidence: 'other' },
    }
    expect(recordAdoption(ANTHROPIC_OWNER, prefix).digest).not.toBe(before)
    expect(recordAdoption(ANTHROPIC_OWNER, evidence).digest).not.toBe(before)
  })
})
