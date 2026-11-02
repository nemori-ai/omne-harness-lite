import assert from 'node:assert/strict'
import test from 'node:test'
import { wrapperDeadlines } from './deadlines.mjs'

test('wrapper includes the full queue and execution budgets without changing MAX_WAIT', () => {
  const result = wrapperDeadlines(1800000, true, {})
  assert.equal(result.queueMs, (7200 + 5) * 1000)
  assert.equal(result.executionMs, 1800000 + 2000)
  assert.equal(
    result.wrapperMs,
    result.queueMs + result.metadataMs + result.executionMs + result.cleanupMs + result.archiveMs,
  )
  const changed = wrapperDeadlines(1800000, true, {
    OMNE_TEST_SLOT_MAX_WAIT_SECONDS: '1',
    OMNE_TEST_SLOT_POLL_SECONDS: '2',
  })
  assert.equal(changed.queueMs, 3000)
  assert.equal(changed.executionMs, result.executionMs)
  assert.throws(
    () => wrapperDeadlines(100, true, { OMNE_TEST_SLOT_MAX_WAIT_SECONDS: 'Infinity' }),
    /integer/,
  )
})
