import { expect, it, vi } from 'vitest'
import type {
  PublicHealthOptions,
  PublicHealthOutcome,
} from '@omne-harness-lite/governance-center-entry-https-json'
import { GovernanceClientConfigurationError } from '@omne-harness-lite/governance-center-entry-https-json'
import { observeCenterProfile } from '../src/center-preparation.ts'

const endpoint = 'https://center.example.invalid/'
const trust = { mode: 'spki' as const, sha256: 'a'.repeat(64) }
const centerId = '1'.repeat(32)
const healthy: PublicHealthOutcome = {
  kind: 'health',
  reply: { reachable: true, centerId, version: 'test-build' },
}
function read(value = healthy) {
  return vi.fn<(input: PublicHealthOptions) => Promise<PublicHealthOutcome>>(async () => value)
}
it('reads verified public health with explicit trust and preserves the template without logging in', async () => {
  const health = read()
  const controller = new AbortController()
  expect(
    await observeCenterProfile(
      '研发中心',
      endpoint,
      trust,
      { timeoutMs: 800, signal: controller.signal },
      health,
    ),
  ).toEqual({
    kind: 'observed',
    profile: { name: '研发中心', center: { centerId, endpoint, trust } },
  })
  expect(health.mock.calls).toEqual([
    [{ url: endpoint, trust, timeoutMs: 800, signal: controller.signal }],
  ])
  expect(health.mock.calls[0]?.[0]).not.toHaveProperty('presentedLoginState')
})
it.each([null, undefined, '', ' \n ', 8, {}])(
  'rejects invalid name %j before network IO',
  async name => {
    const health = read()
    expect(await observeCenterProfile(name, endpoint, trust, {}, health)).toEqual({
      kind: 'invalid-input',
    })
    expect(health).not.toHaveBeenCalled()
  },
)
it.each(['connection', 'trust', 'timeout', 'cancelled', 'response-invalid'] as const)(
  'keeps %s distinct without retry',
  async reason => {
    const outcome: PublicHealthOutcome = { kind: 'unavailable', reason }
    const health = read(outcome)
    expect(await observeCenterProfile('中心', endpoint, trust, {}, health)).toEqual(outcome)
    expect(health).toHaveBeenCalledTimes(1)
  },
)
it('preserves entry answer without saving a profile', async () => {
  const outcome: PublicHealthOutcome = { kind: 'entry-answer', answer: 'version-mismatch' }
  expect(await observeCenterProfile('中心', endpoint, trust, {}, read(outcome))).toEqual(outcome)
})
it('rejects an invalid center ID from a substituted public reader', async () => {
  const health = read({
    kind: 'health',
    reply: { reachable: true, centerId: 'bad', version: 'test' },
  })
  expect(await observeCenterProfile('中心', endpoint, trust, {}, health)).toEqual({
    kind: 'unavailable',
    reason: 'response-invalid',
  })
})
it('classifies the declared configuration error without exposing its raw content', async () => {
  const health = read()
  health.mockRejectedValue(new GovernanceClientConfigurationError('sensitive endpoint input'))
  expect(await observeCenterProfile('中心', endpoint, trust, {}, health)).toEqual({
    kind: 'invalid-input',
  })
  expect(health).toHaveBeenCalledTimes(1)
})
it('does not hide an unexpected transport defect', async () => {
  const health = read()
  const failure = new Error('provider defect')
  health.mockRejectedValue(failure)
  await expect(observeCenterProfile('中心', endpoint, trust, {}, health)).rejects.toBe(failure)
})
it('captures the template before awaiting health so later caller mutation cannot replace trust', async () => {
  const deferred = Promise.withResolvers<PublicHealthOutcome>()
  const health = vi.fn<(input: PublicHealthOptions) => Promise<PublicHealthOutcome>>(
    () => deferred.promise,
  )
  const callerTrust = { ...trust }
  const preparation = observeCenterProfile('中心', endpoint, callerTrust, {}, health)
  callerTrust.sha256 = 'b'.repeat(64)
  deferred.resolve(healthy)
  expect(await preparation).toEqual({
    kind: 'observed',
    profile: { name: '中心', center: { centerId, endpoint, trust } },
  })
  expect(health.mock.calls[0]?.[0].trust).toEqual(trust)
})
