import { expect, it } from 'vitest'
import { judgeContentBlock, validate } from '../src/index.ts'

const denial = { id: 'denied-result', kind: 'tool_result', visibility: { toHuman: true, toModel: true }, callId: 'denied-call', outcome: 'denied', reason: { kind: 'admission', code: 'permission_forbidden', by: 'omne-official:admission', conclusion: 'decision:1' }, blocks: [] }
it('validates denial as a call response without adding it to execution outcomes', () => {
  expect(validate('ExecutionOutcome', 'denied').valid).toBe(false)
  expect(validate('ToolCallOutcome', 'denied').valid).toBe(true)
  expect(judgeContentBlock(denial)).toHaveProperty('ok')
  const { reason, ...missingReason } = denial
  expect(judgeContentBlock(missingReason)).toHaveProperty('rejected')
  expect(judgeContentBlock({ ...denial, reason: { ...reason, code: 'unknown' } })).toHaveProperty('rejected')
  expect(judgeContentBlock({ ...denial, offloaded: { storage: 's', key: 'k', mediaType: 'text/plain' } })).toHaveProperty('rejected')
})
