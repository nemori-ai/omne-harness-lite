import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { judgeMessage, judgePart } from '@omne-harness/message'

const id = 'msg_abcdefghijklmnopqrstuv'
const text = {
  kind: 'text',
  id: 'b1',
  visibility: { toHuman: true, toModel: true },
  text: 'hello',
}

function message(role: string, blocks: readonly unknown[] = [text]) {
  return { id, role, blocks }
}

it('M1 admits an assistant message with one text block', () => {
  expect(judgeMessage(message('assistant'))).toEqual({
    ok: { id, role: 'assistant', blocks: [text] },
  })
})

it('M2 admits each of the other five log roles', () => {
  for (const role of ['user', 'tool', 'tool_internal', 'system_reminder', 'compaction']) {
    expect(judgeMessage(message(role))).toEqual({ ok: { id, role, blocks: [text] } })
  }
})

it('M3 rejects role system', () => {
  expect(judgeMessage(message('system'))).toEqual({ rejected: 'unknown' })
})

it('M4 rejects absent, null, and empty blocks', () => {
  expect(judgeMessage({ id, role: 'assistant' })).toEqual({ rejected: 'missing' })
  expect(judgeMessage({ id, role: 'assistant', blocks: null })).toEqual({ rejected: 'null' })
  expect(judgeMessage(message('assistant', []))).toEqual({ rejected: 'empty' })
})

it('M5 rejects an extra key tenant', () => {
  expect(judgeMessage({ ...message('assistant'), tenant: 'a' })).toEqual({ rejected: 'extra' })
})

it('M6 rejects a tool_call that has no callId', () => {
  expect(judgeMessage(message('assistant', [{ kind: 'tool_call' }]))).toEqual({
    rejected: 'callId',
    blockIndex: 0,
  })
})

it('M7 judges the README sample imported from @omne-harness/message', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const fenced = /```json\n([\s\S]*?)\n```/u.exec(readme)
  if (fenced?.[1] === undefined) throw new Error('README sample missing')
  expect(judgeMessage(JSON.parse(fenced[1]))).toEqual(judgeMessage(message('assistant')))
})

it('keeps other own keys on a tool part', () => {
  expect(judgePart({ kind: 'tool_call', callId: 'call_1', arguments: '{"a":1}' })).toEqual({
    ok: { kind: 'tool_call', callId: 'call_1', arguments: '{"a":1}' },
  })
})
