import { describe, expect, it } from 'vitest'
import { type JsonValue } from '@omne-harness/json-text'
import { judgeMessage } from '@omne-harness/message'

const id = 'msg_abcdefghijklmnopqrstuv'
const visibility = { toHuman: true, toModel: true }
const hidden = { toHuman: false, toModel: false }
const args: JsonValue = { kind: 'null' }

const text = { kind: 'text', id: 't1', visibility, text: 'hello' }
const call = { kind: 'tool_call', id: 'c1', visibility, callId: 'k', name: 'echo', arguments: args }
const incomplete = {
  kind: 'tool_call_incomplete',
  id: 'i1',
  visibility: hidden,
  callId: 'k',
  name: 'echo',
  partial: '',
}
const unparsed = {
  kind: 'tool_call_unparsed',
  id: 'u1',
  visibility,
  callId: 'k',
  name: '',
  raw: '{',
}
const marker = { kind: 'tool_result', id: 'r1', visibility, callId: 'k' }

const compactionKeys = {
  covers: { from: 'e1', to: 'e1' },
  retained: [],
  derivation: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
}

function judged(role: string, blocks: readonly unknown[]) {
  return judgeMessage({ id, role, blocks, ...(role === 'compaction' ? compactionKeys : {}) })
}

describe('tool role', () => {
  it('admits a marker alone, and a marker followed by closed content blocks', () => {
    expect(judged('tool', [marker])).toEqual({ ok: { id, role: 'tool', blocks: [marker] } })
    expect(judged('tool', [marker, text])).toEqual({
      ok: { id, role: 'tool', blocks: [marker, text] },
    })
  })

  it('rejects a body that does not start with the marker', () => {
    expect(judged('tool', [text])).toEqual({ rejected: 'tool-blocks', blockIndex: 0 })
    expect(judged('tool', [text, marker])).toEqual({ rejected: 'tool-blocks', blockIndex: 0 })
    expect(judged('tool', [call])).toEqual({ rejected: 'tool-blocks', blockIndex: 0 })
  })

  it('rejects a second marker', () => {
    expect(judged('tool', [marker, { ...marker, id: 'r2' }])).toEqual({
      rejected: 'tool-blocks',
      blockIndex: 1,
    })
    expect(judged('tool', [marker, text, { ...marker, id: 'r2' }])).toEqual({
      rejected: 'tool-blocks',
      blockIndex: 2,
    })
  })

  it('rejects a tool part, a variant included, after the marker', () => {
    expect(judged('tool', [marker, call])).toEqual({ rejected: 'tool-blocks', blockIndex: 1 })
    expect(judged('tool', [marker, incomplete])).toEqual({ rejected: 'tool-blocks', blockIndex: 1 })
    expect(judged('tool', [marker, unparsed])).toEqual({ rejected: 'tool-blocks', blockIndex: 1 })
  })

  it('does not take a block that judgeContentBlock refuses', () => {
    expect(judged('tool', [marker, { ...text, tenant: 'a' }])).toEqual({
      rejected: 'extra',
      blockIndex: 1,
    })
  })
})

describe('roles other than tool', () => {
  it.each(['user', 'assistant', 'tool_internal', 'system_reminder', 'compaction'])(
    'rejects a marker in a %s message',
    role => {
      expect(judged(role, [text, marker])).toEqual({ rejected: 'tool-blocks', blockIndex: 1 })
    },
  )

  it.each(['user', 'tool', 'tool_internal', 'system_reminder', 'compaction'])(
    'rejects each call part in a %s message',
    role => {
      const lead = role === 'tool' ? [marker] : [text]
      for (const part of [call, incomplete, unparsed]) {
        expect(judged(role, [...lead, part])).toEqual({ rejected: 'tool-blocks', blockIndex: 1 })
      }
    },
  )

  it('admits all three call parts in an assistant message, and no marker is needed', () => {
    const blocks = [text, call, incomplete, unparsed]
    expect(judged('assistant', blocks)).toEqual({ ok: { id, role: 'assistant', blocks } })
  })
})

describe('block identity', () => {
  it('rejects the second use of an id, across content blocks and tool parts', () => {
    expect(judged('assistant', [text, { ...call, id: 't1' }])).toEqual({
      rejected: 'duplicate-id',
      blockIndex: 1,
    })
    expect(judged('assistant', [text, { ...text }])).toEqual({
      rejected: 'duplicate-id',
      blockIndex: 1,
    })
    expect(judged('tool', [marker, { ...text, id: 'r1' }])).toEqual({
      rejected: 'duplicate-id',
      blockIndex: 1,
    })
  })

  it('rejects a repeated id that is not adjacent to its first use', () => {
    expect(judged('assistant', [text, call, { ...text }])).toEqual({
      rejected: 'duplicate-id',
      blockIndex: 2,
    })
  })

  it('keeps the same id in two messages apart: the check is per message', () => {
    expect(judged('assistant', [text])).toHaveProperty('ok')
    expect(judged('user', [text])).toHaveProperty('ok')
  })

  it('reports a part failure before a role failure, and a role failure before a duplicate id', () => {
    expect(judged('user', [{ ...call, name: '' }, marker])).toEqual({
      rejected: 'name',
      blockIndex: 0,
    })
    expect(judged('user', [text, { ...marker, id: 't1' }])).toEqual({
      rejected: 'tool-blocks',
      blockIndex: 1,
    })
  })

  it('takes an unknown key inside visibility as extra, through the shared identity judge', () => {
    expect(
      judged('assistant', [{ ...call, visibility: { toHuman: true, toModel: true, tenant: 'a' } }]),
    ).toEqual({ rejected: 'extra', blockIndex: 0 })
  })
})
