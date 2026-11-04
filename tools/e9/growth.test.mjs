import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateGrowth, measured, syntheticRounds, unmeasured } from './metrics.mjs'

const cases = {
  constant: [() => 10, 'pass'],
  linear: [round => round, 'fail'],
  intercept: [round => 1000 + round, 'fail'],
  lowAmplitude: [round => 1e-9 * round, 'fail'],
  step: [round => (round < 100 ? 10 : 20), 'pass'],
  saturation: [round => 100 * (1 - Math.exp(-round / 10)), 'pass'],
  alternatingNoise: [round => (round % 2 ? 10 : 100), 'pass'],
  nearZero: [() => 1e-300, 'pass'],
}
for (const [name, [value, state]] of Object.entries(cases)) {
  test(`fixed-sample growth ${name}`, () => {
    const rounds = syntheticRounds('steady')
    for (const row of rounds) row.stages.sessionIO = measured(value(row.round), 'ms', 'synthetic')
    const result = evaluateGrowth(rounds).sessionIO
    assert.equal(result.state, state)
    assert.equal(result.blocks.length, 19)
    assert.ok(Number.isFinite(result.slope))
  })
}

test('growth refuses missing rounds, missing observations, and clock generation changes', () => {
  const rounds = syntheticRounds('steady')
  assert.equal(evaluateGrowth(rounds.slice(0, 199)).sessionIO.state, 'blocked')
  rounds[70].stages.sessionIO = unmeasured('lost event')
  assert.equal(evaluateGrowth(rounds).sessionIO.state, 'blocked')
  rounds[70].stages.sessionIO = measured(10, 'ms', 'synthetic')
  rounds[70].stageClocks.sessionIO.generation = 'restarted'
  assert.equal(evaluateGrowth(rounds).sessionIO.state, 'blocked')
})

test('large finite stage durations never serialize nonfinite statistics as null', () => {
  const rounds = syntheticRounds('steady')
  for (const row of rounds)
    row.stages.sessionIO = measured(row.round < 100 ? 0 : Number.MAX_VALUE, 'ms', 'synthetic')
  const result = evaluateGrowth(rounds).sessionIO
  assert.equal(result.state, 'blocked')
  assert.doesNotMatch(JSON.stringify(result), /null/)
})
