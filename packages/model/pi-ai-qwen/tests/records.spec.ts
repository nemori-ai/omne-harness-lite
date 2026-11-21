import { describe, expect, it } from 'vitest'
import { defineFamily, RECORD_FACTS, recordAdoption } from '@omne-harness/pi-ai-transport'
import { openAiTokenizerResources } from '@omne-harness/pi-ai-openai'
import {
  QWEN_OWNER,
  QWEN_REASONING_FORMAT,
  QWEN_RECORDS,
  type QwenRecord,
} from '@omne-harness/pi-ai-qwen'

const RECORDS: readonly QwenRecord[] = QWEN_RECORDS
const [RECORD] = RECORDS
if (RECORD === undefined) throw new Error('no Qwen record')

describe('the one Qwen record', () => {
  it('is qwen/qwen3.8-omni-flash at revision 1, current, routed through OpenRouter to the same name', () => {
    expect(RECORDS.map(record => `${record.name}/${record.revision}`)).toEqual([
      'qwen/qwen3.8-omni-flash/1',
    ])
    expect(RECORD.status).toBe('current')
    expect(RECORD.route).toEqual({ provider: 'openrouter', model: 'qwen/qwen3.8-omni-flash' })
    expect(RECORD).not.toHaveProperty('engine')
  })

  it('pins the Alibaba upstream, which every response names', () => {
    expect(RECORD.serving).toEqual({ order: ['alibaba'], reports: ['Alibaba'] })
  })

  it('takes text and voice and gives text, with the window and limits of the endpoint metadata', () => {
    expect(RECORD.profile.input).toEqual(['text', 'voice'])
    expect(RECORD.profile.output).toEqual(['text'])
    expect(RECORD.profile.context).toEqual({
      window: { provided: '1000000', upstream: { kind: 'finite', amount: '1000000' } },
      input: { provided: '983616', upstream: { kind: 'finite', amount: '983616' } },
      output: { provided: '131072', upstream: { kind: 'finite', amount: '131072' } },
    })
    expect(RECORD.profile.limits).toEqual([
      { metric: 'voice-bytes', provided: '10485760', upstream: { kind: 'unknown' } },
      { metric: 'voice-duration-ms', provided: '300000', upstream: { kind: 'unknown' } },
    ])
    expect(RECORD.profile.evidence).toContain('observed 2026-11-21')
  })

  it('writes WAV speech as input_audio and takes no image; caching is implicit, so the wire writes no breakpoint', () => {
    expect(RECORD.wire).toEqual({
      roles: { instruction: 'system', reminder: 'system' },
      content: 'compact',
      cache: { kind: 'none' },
      image: null,
      voice: { formats: { 'audio/wav': 'wav' } },
      fixed: [],
      usageTail: { maxFrames: 2 },
      toolNames: { rule: 'underscore/1', maxLength: 64 },
    })
    expect(RECORD.extensions).toEqual([])
  })

  it('supports low, medium, high and max effort as themselves, maps none to unsupported and has the model default', () => {
    const rule = RECORD.parameters['reasoning-effort']
    if (rule.support !== 'supported') throw new Error('reasoning effort must be supported')
    expect(rule.default).toEqual({ kind: 'absent' })
    expect(rule.wire).toEqual({
      none: 'unsupported',
      low: { field: 'reasoning.effort', value: 'low' },
      medium: { field: 'reasoning.effort', value: 'medium' },
      high: { field: 'reasoning.effort', value: 'high' },
      max: { field: 'reasoning.effort', value: 'max' },
    })
  })

  it('supports max_tokens up to 131072 and nothing it did not measure in effect', () => {
    for (const kind of [
      'temperature',
      'top-p',
      'stop',
      'seed',
      'frequency-penalty',
      'presence-penalty',
    ] as const)
      expect(RECORD.parameters[kind], kind).toEqual({ support: 'unsupported' })
    expect(RECORD.parameters['max-output-tokens']).toEqual({
      support: 'supported',
      default: { kind: 'absent' },
      accept: { max: '131072' },
      wire: { field: 'max_tokens' },
    })
  })

  it('refuses a forced tool choice, as the upstream does in thinking mode', () => {
    expect(RECORD.accepts).toEqual({ forcedToolChoice: false })
  })

  it('carries the reasoning text back in its own format, under its own rules', () => {
    expect(QWEN_REASONING_FORMAT).toBe('qwen-reasoning-text-v1')
    expect(RECORD.replay).toEqual({
      declaration: {},
      formats: { produces: QWEN_REASONING_FORMAT, accepts: [QWEN_REASONING_FORMAT] },
    })
    expect(RECORD.rules).toEqual({
      reasoning: 'qwen-reasoning-text/1',
      usage: 'qwen-usage/1',
      toolSchema: 'object-root/1',
      check: 'none/1',
    })
  })

  it('estimates with the o200k proxy that the release already registers for the OpenAI family', () => {
    expect(RECORD.meter.representation).toBe('qwen-visible-json/1')
    expect(RECORD.meter.text).toBe('o200k-proxy/1')
    expect(RECORD.meter.tokenizer).toEqual(openAiTokenizerResources().definition)
  })

  it('cites its own stream for every fact, measured 2026-11-21, each with a note naming the probe', () => {
    const stream = `packages/model/pi-ai-qwen/tests/fixtures/records/${encodeURIComponent(RECORD.name)}/${RECORD.revision}/stream.sse`
    expect(Object.keys(RECORD.provenance).toSorted()).toEqual([...RECORD_FACTS].toSorted())
    for (const fact of RECORD_FACTS) {
      expect(RECORD.provenance[fact], fact).toMatchObject({
        measuredAt: '2026-11-21',
        evidence: stream,
      })
      expect(RECORD.provenance[fact].note, fact).toMatch(/\S/u)
    }
  })
})

describe('purity and adoption', () => {
  it('the record is plain data that defineFamily accepts', () => {
    const acquire = async () =>
      ({ failure: { kind: 'unavailable', dependency: 'none', diagnostic: 'test' } }) as const
    expect(() => defineFamily({ owner: QWEN_OWNER, records: RECORDS, acquire })).not.toThrow()
  })

  it('a change of what the model accepts, of the wire, of the evidence or of a source changes its adoption', () => {
    const before = recordAdoption(QWEN_OWNER, RECORD).digest
    const changed: readonly QwenRecord[] = [
      { ...RECORD, accepts: { forcedToolChoice: true } },
      { ...RECORD, wire: { ...RECORD.wire, usageTail: { maxFrames: 1 } } },
      { ...RECORD, profile: { ...RECORD.profile, evidence: 'other' } },
      {
        ...RECORD,
        provenance: {
          ...RECORD.provenance,
          cache: { ...RECORD.provenance.cache, measuredAt: '2026-11-22' },
        },
      },
    ]
    for (const record of changed) expect(recordAdoption(QWEN_OWNER, record).digest).not.toBe(before)
  })
})
