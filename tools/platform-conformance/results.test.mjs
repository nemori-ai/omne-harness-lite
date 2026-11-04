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

const skipped = (fullName, status = 'skipped') => ({ status, fullName })
const report = assertions => ({
  testResults: [{ name: '/member/frames.spec.ts', status: 'passed', assertionResults: assertions }],
})
const linuxOnly = {
  file: 'frames.spec.ts',
  test: 'frames linux attach',
  runsOn: ['linux'],
  reason: 'needs the Linux user manager',
}

test('a declared platform-exclusive skip off its platform is recorded, not counted as missing', () => {
  const result = summarize(
    report([{ status: 'passed', fullName: 'frames shared' }, skipped('frames linux attach')]),
    '/member',
    ['frames.spec.ts'],
    { code: 0 },
    { platform: 'win32', exclusive: [linuxOnly] },
  )
  assert.deepEqual(result.issues, [])
  assert.equal(conclusion(result.failed, result.issues.length > 0).exitCode, 0)
  assert.deepEqual(result.files[0].platformExcluded, [
    {
      test: 'frames linux attach',
      status: 'skipped',
      runsOn: ['linux'],
      reason: 'needs the Linux user manager',
    },
  ])
  assert.deepEqual(result.files[0].skipped, [])
})

test('a declared test that skips on its own platform is still missing evidence', () => {
  const result = summarize(
    report([skipped('frames linux attach')]),
    '/member',
    ['frames.spec.ts'],
    { code: 0 },
    { platform: 'linux', exclusive: [linuxOnly] },
  )
  assert.equal(conclusion(result.failed, result.issues.length > 0).exitCode, 3)
  assert.match(result.issues[0], /declared platform linux/)
})

test('undeclared skips and declarations that match nothing stay incomplete', () => {
  for (const [assertions, exclusive] of [
    [[skipped('frames other')], [linuxOnly]],
    [[{ status: 'passed', fullName: 'frames shared' }], [linuxOnly]],
    [[skipped('frames linux attach', 'todo')], []],
  ]) {
    const result = summarize(
      report(assertions),
      '/member',
      ['frames.spec.ts'],
      { code: 0 },
      {
        platform: 'win32',
        exclusive,
      },
    )
    assert.equal(conclusion(result.failed, result.issues.length > 0).exitCode, 3)
  }
})

test('a declared test that runs and passes on its platform uses the declaration', () => {
  const result = summarize(
    report([{ status: 'passed', fullName: 'frames linux attach' }]),
    '/member',
    ['frames.spec.ts'],
    { code: 0 },
    { platform: 'linux', exclusive: [linuxOnly] },
  )
  assert.deepEqual(result.issues, [])
})
