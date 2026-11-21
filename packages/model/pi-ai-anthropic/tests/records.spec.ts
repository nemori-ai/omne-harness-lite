import { describe, expect, it } from 'vitest'
import { defineFamily, RECORD_FACTS, recordAdoption } from '@omne-harness/pi-ai-transport'
import {
  ANTHROPIC_OWNER,
  ANTHROPIC_RECORDS,
  type AnthropicRecord,
} from '@omne-harness/pi-ai-anthropic'

const RECORDS: readonly AnthropicRecord[] = ANTHROPIC_RECORDS

// Each model at the revision of its current record; a record changes its revision when its data
// changes, so the adoption digest of an older revision never names new data.
const REVISIONS = {
  'anthropic/claude-fable-5.2': '1',
  'anthropic/claude-fable-5.1': '3',
  'anthropic/claude-opus-5.5': '3',
  'anthropic/claude-opus-5': '3',
  'anthropic/claude-sonnet-5.5': '2',
  'anthropic/claude-sonnet-5': '3',
  'anthropic/claude-haiku-5.5': '3',
} as const

describe('the migrated models', () => {
  it('has one current record per model, at its revision, and nothing else', () => {
    expect(RECORDS.map(record => `${record.name}/${record.revision}`).toSorted()).toEqual(
      Object.entries(REVISIONS)
        .map(([name, revision]) => `${name}/${revision}`)
        .toSorted(),
    )
    const revisions: Readonly<Record<string, string>> = REVISIONS
    for (const record of RECORDS) {
      expect(record.revision).toBe(revisions[record.name])
      expect(record.status).toBe('current')
      expect(record.route).toEqual({ provider: 'openrouter', model: record.name })
    }
  })

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
        window: { provided: '1000000', upstream: { kind: 'finite', amount: '1000000' } },
        input: { provided: '872000', upstream: { kind: 'unknown' } },
        output: { provided: '128000', upstream: { kind: 'finite', amount: '128000' } },
      })
      expect(record.profile.evidence).toContain(
        'https://platform.claude.com/docs/en/about-claude/models/overview',
      )
      expect(record.profile.evidence).toContain('https://openrouter.ai/api/v1/models/')
      expect(record.profile.evidence).toContain('2026-11-03')
      expect(record.profile.limits).toEqual([
        { metric: 'image-bytes', provided: '4194304', upstream: { kind: 'unknown' } },
      ])
    }
  })
})

describe('the wire data', () => {
  it('pins Anthropic behind OpenRouter on the Messages interface: 1h cache, four image types, summarized thinking, 64-character tool names', () => {
    for (const record of RECORDS) {
      expect(record.engine).toBe('messages')
      expect(record.serving).toEqual({ order: ['anthropic'], reports: ['Anthropic', 'anthropic'] })
      const { file, ...wire } = record.wire
      expect(file).toEqual(
        record.name === 'anthropic/claude-haiku-5.5'
          ? { mediaTypes: ['application/pdf'], maxBytes: 33554432 }
          : undefined,
      )
      expect(wire).toEqual({
        cache: { kind: 'last-message', ttl: '1h' },
        image: { mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] },
        thinking: { display: 'summarized' },
        toolNames: { rule: 'underscore/1', maxLength: 64 },
      })
      expect(record.extensions).toEqual([])
    }
  })

  it('declares the default replay of each model and the Anthropic reasoning format', () => {
    for (const record of RECORDS) {
      expect(record.replay.declaration).toEqual({})
      expect(record.replay.formats).toEqual({
        produces: 'anthropic-messages-v1',
        accepts: ['anthropic-messages-v1'],
      })
    }
  })

  it('states per model what the interface refuses and whether reasoning binds to the prefix', () => {
    const measured = Object.fromEntries(
      RECORDS.map(record => [
        record.name,
        { forcedToolChoice: record.accepts.forcedToolChoice, binding: record.replay.binding },
      ]),
    )
    expect(measured).toEqual({
      'anthropic/claude-fable-5.2': { forcedToolChoice: false, binding: 'prefix' },
      'anthropic/claude-fable-5.1': { forcedToolChoice: false, binding: 'prefix' },
      'anthropic/claude-opus-5.5': { forcedToolChoice: false, binding: 'prefix' },
      'anthropic/claude-opus-5': { forcedToolChoice: true, binding: 'none' },
      'anthropic/claude-sonnet-5.5': { forcedToolChoice: false, binding: 'prefix' },
      'anthropic/claude-sonnet-5': { forcedToolChoice: true, binding: 'none' },
      'anthropic/claude-haiku-5.5': { forcedToolChoice: true, binding: 'prefix' },
    })
    for (const record of RECORDS) {
      expect(record.accepts.endsWithAssistant).toBe(false)
      expect(Object.keys(record.provenance).toSorted()).toEqual([...RECORD_FACTS].toSorted())
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
    expect(() => defineFamily({ owner: ANTHROPIC_OWNER, records: RECORDS, acquire })).not.toThrow()
    const digests = RECORDS.map(record => recordAdoption(ANTHROPIC_OWNER, record).digest)
    expect(new Set(digests).size).toBe(RECORDS.length)
  })

  it('a change of the replay formats, the replay binding or the evidence changes the adoption', () => {
    const [record] = RECORDS
    if (record === undefined) throw new Error('no record')
    const before = recordAdoption(ANTHROPIC_OWNER, record).digest
    const formats: AnthropicRecord = {
      ...record,
      replay: {
        ...record.replay,
        formats: { produces: 'anthropic-messages-v1', accepts: ['anthropic-messages-v1', 'other'] },
      },
    }
    const binding: AnthropicRecord = {
      ...record,
      replay: { ...record.replay, binding: record.replay.binding === 'prefix' ? 'none' : 'prefix' },
    }
    const evidence: AnthropicRecord = {
      ...record,
      profile: { ...record.profile, evidence: 'other' },
    }
    expect(recordAdoption(ANTHROPIC_OWNER, formats).digest).not.toBe(before)
    expect(recordAdoption(ANTHROPIC_OWNER, binding).digest).not.toBe(before)
    expect(recordAdoption(ANTHROPIC_OWNER, evidence).digest).not.toBe(before)
  })
})
