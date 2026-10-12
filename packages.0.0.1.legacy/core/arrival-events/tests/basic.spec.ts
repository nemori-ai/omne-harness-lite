import { expect, test } from 'vitest'
import { judgeArrivalEnvelope, judgeArrivalEnvelopeText, reduceFills } from '../src/index.ts'
import { modelTarget, frameTarget, opened } from './fixtures.ts'

test('two optional open-block predicates do not participate without an open view', () => {
  const envelope = { target: modelTarget, event: { t: 'fill', index: 0, payload: '' } }
  expect(judgeArrivalEnvelope(envelope)).toEqual({ ok: true })
  expect(judgeArrivalEnvelope(envelope, () => undefined)).toEqual({ ok: true })
  expect(judgeArrivalEnvelope(envelope, () => opened('voice', 'replace'))).toEqual({
    rejected: 'replace_payload_shape',
  })
  expect(
    judgeArrivalEnvelope({ ...envelope, target: frameTarget }, () =>
      opened('voice', 'append', true),
    ),
  ).toEqual({ rejected: 'frame_media_inline' })
})
test('voice fills concatenate decoded bytes and text/tool arguments remain verbatim', () => {
  expect(reduceFills({ kind: 'voice', fill: 'append' }, ['YQ==', 'Yg=='])).toBe('YWI=')
  expect(reduceFills({ kind: 'tool_call', fill: 'append' }, ['{"path": ', '"a.md"}'])).toBe(
    '{"path": "a.md"}',
  )
  expect(reduceFills({ kind: 'text', fill: 'replace' }, ['old', ''])).toBe('')
  expect(reduceFills({ kind: 'text', fill: 'append' }, [])).toBeUndefined()
})
test('nested duplicate JSON fields reject before any judgment and exact billed values survive', () => {
  expect(
    judgeArrivalEnvelopeText(
      '{"target":{"kind":"model_call","callId":"m","dispatch":1},"event":{"t":"fill","index":0,"payload":{"kind":"image","kind":"image"}}}',
    ),
  ).toEqual({ rejected: 'malformed' })
  expect(
    judgeArrivalEnvelopeText(
      '{"target":{"kind":"model_call","callId":"m","dispatch":1},"event":{"t":"account","usage":{"input_tokens":1e999,"output_tokens":1,"cache_read_tokens":0,"cache_write_tokens":0,"source":"upstream"},"cost":{"cost_usd":1e-999,"source":"upstream_usage"}}}',
    ),
  ).toEqual({ ok: true })
})
