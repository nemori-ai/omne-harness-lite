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

const compactionKeys = {
  covers: { from: 'e1', to: 'e1' },
  retained: [],
  derivation: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
}

it('M2 admits each of the other five log roles', () => {
  for (const role of ['user', 'tool_internal', 'system_reminder']) {
    expect(judgeMessage(message(role))).toEqual({ ok: { id, role, blocks: [text] } })
  }
  expect(judgeMessage({ ...message('compaction'), ...compactionKeys })).toEqual({
    ok: { id, role: 'compaction', blocks: [text], ...compactionKeys },
  })
  const marker = { kind: 'tool_result', id: 'r1', visibility: text.visibility, callId: 'c1' }
  expect(judgeMessage(message('tool', [marker, text]))).toEqual({
    ok: { id, role: 'tool', blocks: [marker, text] },
  })
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
  const noCallId = {
    kind: 'tool_call',
    id: 'c1',
    visibility: text.visibility,
    name: 'n',
    arguments: { kind: 'null' },
  }
  expect(judgeMessage(message('assistant', [noCallId]))).toEqual({
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

const marker = { kind: 'tool_result', id: 'r1', visibility: text.visibility, callId: 'c1' }

it('takes no own key beyond the closed ones, whatever its value', () => {
  const cyclic: Record<string, unknown> = { ...marker }
  cyclic.self = cyclic
  for (const payload of [() => 1, 1n, Number.NaN, undefined, { n: 1 }, cyclic]) {
    expect(judgePart({ ...marker, payload })).toEqual({ rejected: 'extra' })
  }
  expect(judgeMessage(message('tool', [{ ...marker, payload: () => 1 }]))).toEqual({
    rejected: 'extra',
    blockIndex: 0,
  })
})

it('keeps an own __proto__ key out of the part: it is an extra key, not a prototype', () => {
  const parsed = JSON.parse(
    '{"kind":"tool_result","id":"r1","visibility":{"toHuman":true,"toModel":true},"callId":"c1","__proto__":{"injected":true}}',
  )
  expect(judgePart(parsed)).toEqual({ rejected: 'extra' })
  expect(Object.hasOwn(Object.prototype, 'injected')).toBe(false)
})

it('rejects a tool part whose required fields are not enumerable', () => {
  expect(
    judgePart(
      Object.defineProperties(
        {},
        {
          kind: { value: 'tool_call' },
          callId: { value: 'c1' },
        },
      ),
    ),
  ).toEqual({ rejected: 'json' })
})

it('rejects a part whose kind and callId are only inherited', () => {
  expect(judgePart(Object.create({ kind: 'tool_call', callId: 'c1' }))).toEqual({
    rejected: 'json',
  })
})

it('reads blocks by index, not through an iterator the input defines', () => {
  const call = {
    kind: 'tool_call_unparsed',
    id: 'b2',
    visibility: text.visibility,
    callId: 'c1',
    name: 'n',
    raw: '{',
  }
  const blocks = [text, call]
  Object.defineProperty(blocks, Symbol.iterator, {
    value: function* () {
      yield text
    },
  })
  expect(judgeMessage(message('user', blocks))).toEqual({ rejected: 'tool-blocks', blockIndex: 1 })
})
