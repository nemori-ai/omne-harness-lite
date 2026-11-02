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
  assert.equal(cliObservation('create-session', { exitCode: 0, stdout: '{}' }).state, 'fail')
})

test('zero exit requires the public successful response for the requested operation', () => {
  for (const stdout of [
    'broken',
    'null',
    '[]',
    '{}',
    '{"result":"uncertain"}',
    '{"result":"response","outcome":"denied","body":{}}',
    '{"result":"response","outcome":"succeeded","body":{}}',
  ]) {
    assert.equal(cliObservation('create-session', { exitCode: 0, stdout }).state, 'fail', stdout)
  }
  const successful = {
    register: {
      accountId: 'account',
      organizationId: 'organization',
      tenantId: '{"account":"account","organization":"organization"}',
    },
    login: {
      loginIdentifier: 'account',
      issuedAt: '2026-11-02T00:00:00.000Z',
      tenantId: '{"account":"account","organization":"organization"}',
    },
    'create-session': { session: 'a'.repeat(64), recovered: false },
  }
  for (const [operation, body] of Object.entries(successful)) {
    const response = {
      result: 'response',
      outcome: 'succeeded',
      body,
      request: {
        messageId: 'message',
        ...(operation === 'create-session'
          ? { createCallId: 'call', tenant: '{"account":"account","organization":"organization"}' }
          : {}),
      },
    }
    assert.equal(
      cliObservation(operation, { exitCode: 0, stdout: JSON.stringify(response) }).state,
      'pass',
      operation,
    )
    assert.equal(
      cliObservation(operation, { exitCode: 1, stdout: JSON.stringify(response) }).state,
      'fail',
      operation,
    )
    response.outcome = 'no-change'
    assert.equal(
      cliObservation(operation, { exitCode: 0, stdout: JSON.stringify(response) }).state,
      'fail',
      operation,
    )
  }
})

test('observations do not echo malformed response bodies or login proof', () => {
  const response = {
    result: 'response',
    outcome: 'succeeded',
    body: { loginProof: 'test-secret-do-not-log' },
    request: { messageId: 'message' },
  }
  const observation = cliObservation('login', { exitCode: 0, stdout: JSON.stringify(response) })
  assert.equal(observation.state, 'fail')
  assert.ok(!JSON.stringify(observation).includes('test-secret-do-not-log'))
})
