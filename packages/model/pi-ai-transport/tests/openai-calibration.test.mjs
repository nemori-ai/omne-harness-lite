import { readFileSync } from 'node:fs'
import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, prepare } from './fixtures/openai/calibration.mjs'

const prior = JSON.parse(
  readFileSync(new URL('./fixtures/openai/initial-baselines.json', import.meta.url)),
)
let packet
before(async () => {
  packet = await prepare(prior)
})

// Synthetic observations test the experiment arithmetic, not a model or route.
function observations(stage = 'fit') {
  const cases = [
    ...packet.baseline,
    ...packet.cases.filter(c => c.set === 'fit' || stage === 'holdout'),
  ]
  return cases.map(c => ({
    id: c.id,
    modelId: c.modelId,
    requestSha256: c.requestSha256,
    provider: 'OpenAI',
    promptTokens: c.features.o200kTextTokens + (c.modelId.endsWith('-pro') ? 1501 : 14),
  }))
}

describe('frozen per-model GPT-6 calibration experiment', () => {
  it('produces six fit and six held-out requests changing only user text', () => {
    assert.equal(packet.cases.length, 12)
    assert.ok(packet.cases.slice(0, 6).every(c => c.set === 'fit'))
    assert.ok(packet.cases.slice(6).every(c => c.set === 'holdout'))
    assert.deepEqual(
      packet.baseline.map(c => c.features.o200kTextTokens),
      [25, 27, 29, 29, 32, 31],
    )
    for (const c of packet.cases) {
      const base = packet.baseline.find(b => b.modelId === c.modelId)
      const body = structuredClone(c.body)
      body.messages[2].content[0].text = base.body.messages[2].content[0].text
      assert.deepEqual(body, base.body)
    }
  })
  it('never pools a Pro usage offset into another model', () => {
    const observed = observations()
    observed.find(o => o.id === packet.baseline[1].id).promptTokens += 2700
    const report = analyze(packet, observed, 'fit')
    assert.equal(report.rows[0].frozenOffset, 14)
    assert.equal(report.rows[1].frozenOffset, 4201)
    assert.equal(report.rows[1].cases[0].residual, -2700)
    assert.equal(report.rows[2].frozenOffset, 14)
    assert.equal(report.rows[1].usageSemantics, 'aggregate-work-risk-not-context-count')
  })
  it('retains a failed held-out prediction without refitting on fit or holdout usage', () => {
    const observed = observations('holdout')
    observed.find(o => o.id === packet.cases[0].id).promptTokens += 8
    observed.find(o => o.id === packet.cases[6].id).promptTokens += 67
    const report = analyze(packet, observed, 'holdout')
    assert.equal(report.rows[0].frozenOffset, 14)
    assert.deepEqual(
      report.rows[0].cases.map(c => c.residual),
      [8, 67],
    )
  })
  it('allows one complete model group without waiting for other models', () => {
    const observed = observations().filter(o => o.modelId === 'openai/gpt-6-sol')
    const report = analyze(packet, observed, 'fit')
    assert.equal(report.rows.length, 1)
    assert.equal(report.unassessedModels.length, 5)
    assert.equal(report.rows[0].frozenOffset, 14)
  })
  it('refuses incomplete, duplicated, substituted or route-mismatched observations', () => {
    assert.throws(() => analyze(packet, observations().slice(1), 'fit'), /exact observations/)
    for (const field of ['provider', 'requestSha256', 'modelId']) {
      const observed = observations()
      observed[0][field] = 'wrong'
      assert.throws(() => analyze(packet, observed, 'fit'), /unusable observation/)
    }
    const duplicate = observations()
    duplicate[1] = duplicate[0]
    assert.throws(() => analyze(packet, duplicate, 'fit'), /duplicate/)
    const missing = observations()
    delete missing[0].promptTokens
    assert.throws(() => analyze(packet, missing, 'fit'), /unusable observation/)
  })
})
