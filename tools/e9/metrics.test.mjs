import assert from 'node:assert/strict'
import test from 'node:test'
import { measured, unmeasured, evaluateMedian, syntheticRounds } from './metrics.mjs'

test('steady synthetic records pass and growing records fail the median gate', () => {
  assert.equal(evaluateMedian(syntheticRounds('steady')).state, 'pass')
  assert.equal(evaluateMedian(syntheticRounds('growth')).state, 'fail')
  assert.equal(evaluateMedian(syntheticRounds('steady'), 1).ratio, 1)
})

test('missing measurements and incomplete windows remain blocked', () => {
  const rounds = syntheticRounds('steady')
  rounds[190].ownOverhead = unmeasured('not observed')
  assert.equal(evaluateMedian(rounds).state, 'blocked')
  assert.equal(evaluateMedian(rounds.slice(0, 180)).state, 'blocked')
})

test('zero baseline and numeric overflow never produce pseudo ratios', () => {
  const rounds = syntheticRounds('steady')
  for (const round of rounds) round.ownOverhead = measured(0, 'ms', 'synthetic')
  assert.equal(evaluateMedian(rounds).state, 'blocked')
  for (const round of rounds) round.ownOverhead = measured(Number.MAX_VALUE, 'ms', 'synthetic')
  assert.equal(evaluateMedian(rounds).ratio, 1)
  for (const round of rounds) round.ownOverhead = measured(Number.MIN_VALUE, 'ms', 'synthetic')
  assert.equal(evaluateMedian(rounds).ratio, 1)
  assert.throws(() => measured(Infinity, 'ms', 'synthetic'), /finite/)
  assert.throws(() => measured(1.5, 'count', 'synthetic'), /integer/)
  for (const value of [0, -1, NaN, Infinity])
    assert.throws(() => evaluateMedian(rounds, value), /threshold/)
})

test('duplicate, unordered, malformed, and wrong-unit records are rejected', () => {
  const rounds = syntheticRounds('steady')
  assert.throws(() => evaluateMedian([...rounds, rounds[0]]), /round/)
  rounds[12].ownOverhead = measured(10, 'count', 'synthetic')
  assert.throws(() => evaluateMedian(rounds), /unit/)
  rounds[12].ownOverhead = { state: 'unmeasured' }
  assert.throws(() => evaluateMedian(rounds), /reason/)
})
