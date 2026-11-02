import assert from 'node:assert/strict'
import test from 'node:test'
import { cliObservation } from './product.mjs'

test('a trustworthy unavailable basis is pending while its original exit code is preserved', () => {
  const result = cliObservation('create-session', {
    exitCode: 4,
    stdout: JSON.stringify({ result: 'response', outcome: 'basis-unavailable', body: {} }),
  })
  assert.equal(result.state, 'blocked')
  assert.equal(result.exitCode, 4)
  assert.equal(result.outcome, 'basis-unavailable')
})

test('an untrusted or different non-success response remains a failed probe', () => {
  assert.equal(cliObservation('create-session', { exitCode: 4, stdout: 'broken' }).state, 'fail')
  assert.equal(cliObservation('create-session', { exitCode: 2, stdout: '{}' }).state, 'fail')
  assert.equal(cliObservation('create-session', { exitCode: 0, stdout: '{}' }).state, 'pass')
})
