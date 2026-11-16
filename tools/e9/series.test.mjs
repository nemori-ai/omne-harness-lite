import assert from 'node:assert/strict'
import test from 'node:test'
import { blockGrowth, evaluateSeries } from './metrics.mjs'

const steady = Array.from({ length: 200 }, (_, index) => 100 + ((index * 37) % 7))

test('a steady series passes both gates of a per-round series', () => {
  const result = evaluateSeries(steady)
  assert.equal(result.median.state, 'pass')
  assert.equal(result.growth.state, 'pass')
})

test('a linearly growing series fails both gates', () => {
  const result = evaluateSeries(steady.map((value, index) => value + index * 5))
  assert.equal(result.median.state, 'fail')
  assert.ok(result.median.ratio > 1.5)
  assert.equal(result.growth.state, 'fail')
  assert.ok(result.growth.r2 >= 0.95)
})

test('growth inside the window ratio still fails the block gate', () => {
  const result = evaluateSeries(steady.map((value, index) => value + index * 0.2))
  assert.equal(result.median.state, 'pass')
  assert.equal(result.growth.state, 'fail')
})

test('a short series, a non-finite value or a non-positive early window stays blocked', () => {
  assert.equal(evaluateSeries(steady.slice(0, 20)).median.state, 'blocked')
  assert.equal(evaluateSeries(steady.slice(0, 20)).growth.state, 'blocked')
  const holed = [...steady]
  holed[50] = Number.NaN
  assert.equal(evaluateSeries(holed).growth.state, 'blocked')
  assert.equal(evaluateSeries(steady.map(() => 0)).median.state, 'blocked')
  assert.throws(() => evaluateSeries(steady, 0), /threshold/)
})

test('the windows are rounds 11-30 and 181-200, and a ratio equal to the threshold passes', () => {
  const values = Array.from({ length: 200 }, (_, index) => {
    if (index < 10) return 1
    if (index < 30) return 100 + (index - 10)
    if (index >= 170 && index < 180) return 1000
    if (index >= 180) return 150 + (index - 180) * 1.5
    return 120
  })
  const result = evaluateSeries(values)
  assert.equal(result.median.earlyMedian, 109.5)
  assert.equal(result.median.lateMedian, 164.25)
  assert.equal(result.median.ratio, 1.5)
  assert.equal(result.median.state, 'pass')
  assert.equal(result.growth.blocks[0].y, median(values.slice(10, 20)))
})

test('a negative early window is blocked, not read as a ratio', () => {
  const values = Array.from({ length: 200 }, (_, index) => (index < 100 ? -10 : -5))
  assert.equal(evaluateSeries(values).median.state, 'blocked')
})

test('a series of other than 200 values is blocked', () => {
  const values = Array.from({ length: 300 }, () => 100)
  assert.equal(evaluateSeries(values).median.state, 'blocked')
  assert.equal(evaluateSeries(values).growth.state, 'blocked')
})

test('a noisy climb with R² between 0.95 and 0.99 fails when it exceeds three MADs', () => {
  const noise = [3, -2, 4, -5, 1, -3, 5, -1, 2, -4, 3, -2, 1, -5, 4, -1, 2, -3, 0]
  const values = noise.flatMap((error, block) => Array(10).fill(100 + block * 3 + error))
  const result = blockGrowth(values)
  assert.ok(result.r2 >= 0.95 && result.r2 < 0.99)
  assert.ok(result.slope * 180 > 3 * result.residualMAD)
  assert.ok(result.slope * 180 < 30 * result.residualMAD)
  assert.equal(result.state, 'fail')
})

test('blockGrowth names a non-finite value as the reason it is blocked', () => {
  const values = Array.from({ length: 190 }, () => 100)
  values[7] = Number.POSITIVE_INFINITY
  assert.match(blockGrowth(values).reason, /finite values/)
})

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
