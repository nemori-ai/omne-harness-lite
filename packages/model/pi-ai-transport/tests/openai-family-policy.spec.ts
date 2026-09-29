import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  classifyOpenAiDetail,
  openAiBasisRecord,
  OPENAI_FAMILY_ALGORITHM,
  OPENAI_FAMILY_REPLAY,
  openAiEnvelopeApplies,
  openAiFamilyRecord,
  openAiFamilyRecords,
  originalOpenAiRecord,
} from '../src/input-meters/openai-family-policy.ts'

const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/openai/priority-family/original-meter-records.json', import.meta.url),
    'utf8',
  ),
)
const rows = Object.values(openAiFamilyRecords)
const route = { order: ['openai'], allow_fallbacks: false, require_parameters: true }
describe('finite OpenAI family applicability records', () => {
  it('has twelve current targets and six unknown Pro input scopes', () => {
    expect(rows).toHaveLength(12)
    expect(rows.filter(row => row.inputScope === 'scope_unknown')).toHaveLength(6)
    expect(openAiFamilyRecord('openai/gpt-6-unknown')).toBeUndefined()
    expect(openAiFamilyRecord('constructor')).toBeUndefined()
    expect(Object.isFrozen(openAiFamilyRecords)).toBe(true)
  })
  it.each(rows)('$modelId retains the independently captured original factory facts', row => {
    const captured = fixture.rows.find((item: { modelId: string }) => item.modelId === row.modelId)
    expect(captured).toBeDefined()
    const original = originalOpenAiRecord(
      row,
      captured.definitionRevision,
      captured.implementation.revision,
    )
    expect(original).toEqual({
      definitionRevision: captured.definitionRevision,
      implementationRevision: captured.implementation.revision,
      algorithmRevision: captured.algorithmRevision,
      tokenizerRevision: captured.tokenizerRevision,
      replayRevision: captured.replayRevision,
      transformRevision: captured.transformRevision,
      projectionRevision: captured.projectionRevision,
    })
    expect(Object.isFrozen(row)).toBe(true)
    expect(Object.isFrozen(row.original)).toBe(true)
    expect(originalOpenAiRecord(row, '999', 'mp4-17')).toBeUndefined()
  })
  it.each(rows)('$modelId limits whole-group proxy routing and actual effort controls', row => {
    const envelope = { model: row.modelId, provider: route }
    expect(openAiEnvelopeApplies(envelope, row)).toBe(true)
    for (const effort of row.efforts)
      expect(openAiEnvelopeApplies({ ...envelope, reasoning: { effort } }, row)).toBe(true)
    for (const bad of [
      { ...envelope, model: 'openai/other' },
      { ...envelope, provider: { ...route, allow_fallbacks: true } },
      { ...envelope, provider: { ...route, order: ['openai', 'other'] } },
      { ...envelope, provider: { ...route, data_collection: 'deny' } },
      { ...envelope, reasoning: { effort: 'unverified' } },
      { ...envelope, reasoning: { context: 'all_turns' } },
      { ...envelope, reasoning: { effort: 'low', context: 'all_turns' } },
    ])
      expect(openAiEnvelopeApplies(bad, row)).toBe(false)
  })
  it.each(rows)(
    '$modelId admits one assigned current identity without accepting arbitrary aliases',
    row => {
      expect(openAiBasisRecord(row, row.definitionRevision, 'mp4-18')).toMatchObject({
        algorithmRevision: OPENAI_FAMILY_ALGORITHM,
        replayRevision: OPENAI_FAMILY_REPLAY,
        tokenizerRevision: row.tokenizerRevision,
      })
      expect(openAiBasisRecord(row, row.definitionRevision, 'mp4-19')).toBeUndefined()
      expect(openAiBasisRecord(row, '999', 'mp4-18')).toBeUndefined()
      expect(openAiBasisRecord(row, row.definitionRevision, 'mp4-17')).toBeUndefined()
    },
  )
  it('retains only the three declared GPT56 prior full/history facts', () => {
    for (const row of rows) {
      expect(row.original.map(original => original.definitionRevision)).toEqual(
        ['openai/gpt-5.6-sol', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-luna'].includes(row.modelId)
          ? ['6', '7', '8']
          : [String(Number(row.definitionRevision) - 1)],
      )
    }
  })
})
describe('OpenAI reasoning classification', () => {
  it('requires a complete group for nonempty exact-format encrypted data', () => {
    expect(
      classifyOpenAiDetail({
        type: 'reasoning.encrypted',
        data: 'opaque',
        format: 'openai-responses-v1',
      }),
    ).toBe('wholeGroup')
    for (const detail of [
      { type: 'reasoning.encrypted', data: 'opaque' },
      { type: 'reasoning.encrypted', data: '', format: 'openai-responses-v1' },
      { type: 'reasoning.encrypted', data: 'opaque', format: 'unknown' },
      { type: 'reasoning.encrypted', data: 'opaque', format: 'openai-responses-v1', index: -1 },
      { type: 'unknown', text: 'opaque' },
    ])
      expect(classifyOpenAiDetail(detail)).toBe('uninterpretable')
  })
  it('keeps visible text/summary without treating unknown metadata as visible', () => {
    expect(classifyOpenAiDetail({ type: 'reasoning.text', text: '' })).toBe('visible')
    expect(
      classifyOpenAiDetail({
        type: 'reasoning.summary',
        summary: 's',
        format: 'openai-responses-v1',
      }),
    ).toBe('visible')
    expect(
      classifyOpenAiDetail({ type: 'reasoning.text', text: '', signature: 'not-openai' }),
    ).toBe('uninterpretable')
  })
})
