import { expect, it } from 'vitest'
import { judgeMessage, type Message } from '@omne-harness/message'
import { decodeModelCallId, replaySourceCall } from '@omne-harness/model-contract'

const seen = { toHuman: true, toModel: true }
const hidden = { toHuman: false, toModel: true }

function built(value: unknown): Message {
  const judged = judgeMessage(value)
  if (!('ok' in judged)) throw new Error(`fixture message: ${JSON.stringify(judged)}`)
  return judged.ok
}

function reply(replay: Record<string, unknown> | undefined): Message {
  const text = { kind: 'text', id: 't', visibility: seen, text: 'answer' }
  const state = { kind: 'reasoning_state', id: 's', visibility: hidden, payload: 'p', pairs: [] }
  return built({
    id: `msg_${'a'.repeat(22)}`,
    role: 'assistant',
    blocks: replay === undefined ? [text] : [text, state],
    ...(replay === undefined ? {} : { replay }),
  })
}

const MARK = { scope: 'A', format: 'f1', at: [1] }

it('reads the call a reply names in its replay mark', () => {
  const call = decodeModelCallId('mcall_source')
  if (!('ok' in call)) throw new Error('call')
  expect(replaySourceCall(reply({ ...MARK, call: 'mcall_source' }))).toBe(call.ok)
})

it('reads no call from a reply whose mark names none or names something that is not a call', () => {
  expect(replaySourceCall(reply(MARK))).toBeNull()
  expect(replaySourceCall(reply(undefined))).toBeNull()
  expect(replaySourceCall(reply({ ...MARK, call: 'mop_not-a-call' }))).toBeNull()
})

it('reads no call from a message that is not a reply', () => {
  const user = built({
    id: `msg_${'b'.repeat(22)}`,
    role: 'user',
    blocks: [{ kind: 'text', id: 'u', visibility: seen, text: 'question' }],
  })
  expect(replaySourceCall(user)).toBeNull()
})
