import { expect, it } from 'vitest'
import { judgeValue, validate } from '../src/index.ts'
import { rewriteChangesImmutable } from '../src/rewrite.ts'

it('accepts denied action subjects without inventing an execution result or an empty batch', () => {
  const subject = { callId: 'call-1', outcome: 'denied' }
  expect(validate('AfterActionEachSubject', subject).valid).toBe(true)
  expect(judgeValue('AfterActionEachSubject', subject)).toHaveProperty('ok')
  for (const result of [
    null,
    {},
    {
      id: 'r',
      kind: 'tool_result',
      callId: 'call-1',
      outcome: 'completed',
      blocks: [],
      visibility: { toHuman: true, toModel: true },
    },
  ]) {
    expect(validate('AfterActionEachSubject', { ...subject, result }).valid).toBe(false)
    expect(judgeValue('AfterActionEachSubject', { ...subject, result })).toHaveProperty('rejected')
  }
  const batch = { outcomes: [subject, { callId: 'call-2', outcome: 'completed' }] }
  expect(judgeValue('AfterActionBatchSubject', batch)).toHaveProperty('ok', batch)
  expect(validate('AfterActionBatchSubject', { outcomes: [] }).valid).toBe(false)
  expect(
    rewriteChangesImmutable('after_action', subject, { ...subject, outcome: 'completed' }),
  ).toBe(true)
})
