import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarize, conclusion } from './results.mjs'

test('failure takes precedence over missing evidence and skip reasons remain explicit', () => {
  const raw = {
    testResults: [
      {
        name: '/member/a.spec.ts',
        status: 'failed',
        assertionResults: [
          { status: 'failed', fullName: 'failed behavior' },
          { status: 'pending', fullName: 'unavailable behavior', skipReason: 'requires Linux' },
        ],
      },
    ],
  }
  const result = summarize(raw, '/member', ['a.spec.ts', 'absent.spec.ts'], { code: 1 })
  assert.deepEqual(conclusion(result.failed, result.issues.length > 0), {
    conclusion: 'failed',
    exitCode: 1,
  })
  assert.equal(result.files[0].skipped[0].reason, 'requires Linux')
  assert.equal(result.files[0].fail, 1)
  assert.equal(result.files[0].skip, 1)
})

test('a missing executable and an interrupted process are incomplete rather than assertion failures', () => {
  for (const processResult of [
    { code: -4058, spawnError: 'ENOENT' },
    { code: 137, interrupted: 'timeout' },
  ]) {
    const result = summarize(null, '/member', ['a.spec.ts'], processResult)
    assert.equal(result.failed, false)
    assert.equal(conclusion(result.failed, result.issues.length > 0).exitCode, 3)
  }
})

test('zero assertions cannot pass even with passed file status', () => {
  const result = summarize(
    { testResults: [{ name: '/member/a.spec.ts', status: 'passed', assertionResults: [] }] },
    '/member',
    ['a.spec.ts'],
    { code: 0 },
  )
  assert.equal(conclusion(result.failed, result.issues.length > 0).exitCode, 3)
})
