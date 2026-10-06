import { expect, it } from 'vitest'
import { judgeContentBlock, validate } from '../src/index.ts'

const denial = {
  id: 'denied-result',
  kind: 'tool_result',
  visibility: { toHuman: true, toModel: true },
  callId: 'denied-call',
  outcome: 'denied',
  reason: {
    kind: 'admission',
    code: 'permission_forbidden',
    by: 'omne-official:admission',
    conclusion: 'decision:1',
  },
  blocks: [],
}
it('validates denial as a call response without adding it to execution outcomes', () => {
  expect(validate('ExecutionOutcome', 'denied').valid).toBe(false)
  expect(validate('ToolCallOutcome', 'denied').valid).toBe(true)
  expect(judgeContentBlock(denial)).toHaveProperty('ok')
  const { reason, ...missingReason } = denial
  expect(judgeContentBlock(missingReason)).toHaveProperty('rejected')
  expect(judgeContentBlock({ ...denial, reason: { ...reason, code: 'unknown' } })).toHaveProperty(
    'rejected',
  )
  expect(
    judgeContentBlock({
      ...denial,
      offloaded: { storage: 's', key: 'k', mediaType: 'text/plain' },
    }),
  ).toHaveProperty('rejected')
})

it('preserves every admission cause and requires the formal reference on all three reason kinds', () => {
  const shared = { by: 'omne-official:admission', conclusion: 'decision:1' }
  const reasons = [
    ...[
      'not_held',
      'permission_forbidden',
      'authorization_denied',
      'run_mode_never',
      'human_refused',
      'human_declined',
    ].map(code => ({ kind: 'admission', code, ...shared })),
    { kind: 'extension_veto', explanation: 'extension refused the call', ...shared },
    { kind: 'admission_unavailable', explanation: 'admission is unavailable', ...shared },
  ]
  for (const reason of reasons) {
    expect(validate('ActionDenialReason', reason).valid).toBe(true)
    expect(judgeContentBlock({ ...denial, reason })).toHaveProperty('ok.reason', reason)
    for (const field of Object.keys(reason)) {
      const incomplete = Object.fromEntries(Object.entries(reason).filter(([key]) => key !== field))
      expect(validate('ActionDenialReason', incomplete).valid).toBe(false)
    }
    for (const field of ['by', 'conclusion']) {
      for (const value of ['', null, 1, {}]) {
        expect(validate('ActionDenialReason', { ...reason, [field]: value }).valid).toBe(false)
      }
    }
    expect(validate('ActionDenialReason', { ...reason, extra: true }).valid).toBe(false)
    for (const outcome of [
      'completed',
      'failed',
      'interrupted',
      'unavailable',
      'backgrounded',
      'no_answer',
    ]) {
      expect(judgeContentBlock({ ...denial, outcome, reason })).toHaveProperty('rejected')
    }
  }
  expect(
    validate('ActionDenialReason', { kind: 'admission', code: 'extension_veto', ...shared }).valid,
  ).toBe(false)
  expect(
    validate('ActionDenialReason', { kind: 'extension_veto', explanation: false, ...shared }).valid,
  ).toBe(false)
})
