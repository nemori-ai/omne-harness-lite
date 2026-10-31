import { describe, expect, it } from 'vitest'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { judgePart } from '@omne-harness/message'

const visibility = { toHuman: true, toModel: true }
const hidden = { toHuman: false, toModel: false }
const args: JsonValue = { kind: 'object', entries: [{ key: 'a', value: { kind: 'null' } }] }

const call = {
  kind: 'tool_call',
  id: 'c1',
  visibility,
  callId: 'call_1',
  name: 'echo',
  arguments: args,
}
const incomplete = {
  kind: 'tool_call_incomplete',
  id: 'i1',
  visibility: hidden,
  callId: 'call_1',
  name: 'echo',
  partial: '{"a"',
}
const unparsed = {
  kind: 'tool_call_unparsed',
  id: 'u1',
  visibility,
  callId: 'call_1',
  name: 'echo',
  raw: '{"a":}',
}
const result = { kind: 'tool_result', id: 'r1', visibility, callId: 'call_1' }

function without(part: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...part }
  delete copy[key]
  return copy
}

function rejection(part: unknown): string | undefined {
  const judged = judgePart(part)
  return 'rejected' in judged ? judged.rejected : undefined
}

describe('tool_call', () => {
  it('admits the six closed keys', () => {
    expect(judgePart(call)).toEqual({ ok: call })
  })

  it.each(['id', 'visibility', 'callId', 'name', 'arguments'])(
    'reports a missing %s by its name',
    key => {
      expect(rejection(without(call, key))).toBe(key)
    },
  )

  it('rejects an extra own key, including the old open payload', () => {
    expect(rejection({ ...call, payload: 1 })).toBe('extra')
    expect(rejection({ ...call, tenant: 'a' })).toBe('extra')
  })

  it('rejects an empty callId and an empty name', () => {
    expect(rejection({ ...call, callId: '' })).toBe('callId')
    expect(rejection({ ...call, name: '' })).toBe('name')
    expect(rejection({ ...call, callId: 1 })).toBe('callId')
    expect(rejection({ ...call, name: null })).toBe('name')
  })

  it('judges id and visibility the way a content block does', () => {
    expect(rejection({ ...call, id: '' })).toBe('id')
    expect(rejection({ ...call, visibility: { toHuman: 'yes', toModel: true } })).toBe('visibility')
    expect(rejection({ ...call, visibility: { toHuman: true, toModel: true, tenant: 'a' } })).toBe(
      'extra',
    )
  })

  it('rejects arguments that are text, and a value tree that is not one', () => {
    expect(rejection({ ...call, arguments: '{"a":1}' })).toBe('arguments')
    expect(rejection({ ...call, arguments: { kind: 'number', lexeme: '01' } })).toBe('arguments')
    expect(rejection({ ...call, arguments: { kind: 'bogus' } })).toBe('arguments')
  })

  it('reports an extra key before it reads a field', () => {
    expect(rejection({ ...call, callId: '', payload: 1 })).toBe('extra')
  })
})

describe('tool_call_incomplete', () => {
  it('admits the six closed keys, an empty partial and an empty name', () => {
    expect(judgePart(incomplete)).toEqual({ ok: incomplete })
    expect(judgePart({ ...incomplete, partial: '' })).toEqual({
      ok: { ...incomplete, partial: '' },
    })
    expect(judgePart({ ...incomplete, name: '' })).toEqual({ ok: { ...incomplete, name: '' } })
  })

  it.each(['id', 'visibility', 'callId', 'name', 'partial'])(
    'reports a missing %s by its name',
    key => {
      expect(rejection(without(incomplete, key))).toBe(key)
    },
  )

  it('rejects an extra key', () => {
    expect(rejection({ ...incomplete, payload: 1 })).toBe('extra')
  })

  it('requires both visibility bits to be false', () => {
    expect(rejection({ ...incomplete, visibility: { toHuman: true, toModel: false } })).toBe(
      'visibility',
    )
    expect(rejection({ ...incomplete, visibility: { toHuman: false, toModel: true } })).toBe(
      'visibility',
    )
    expect(rejection({ ...incomplete, visibility })).toBe('visibility')
  })

  it('rejects null in callId, name and partial, and an empty callId', () => {
    expect(rejection({ ...incomplete, callId: null })).toBe('callId')
    expect(rejection({ ...incomplete, name: null })).toBe('name')
    expect(rejection({ ...incomplete, partial: null })).toBe('partial')
    expect(rejection({ ...incomplete, callId: '' })).toBe('callId')
    expect(rejection({ ...incomplete, partial: 1 })).toBe('partial')
  })
})

describe('tool_call_unparsed', () => {
  it('admits the six closed keys, an empty name and any visibility', () => {
    expect(judgePart(unparsed)).toEqual({ ok: unparsed })
    expect(judgePart({ ...unparsed, name: '' })).toEqual({ ok: { ...unparsed, name: '' } })
    expect(judgePart({ ...unparsed, visibility: hidden })).toEqual({
      ok: { ...unparsed, visibility: hidden },
    })
  })

  it.each(['id', 'visibility', 'callId', 'name', 'raw'])(
    'reports a missing %s by its name',
    key => {
      expect(rejection(without(unparsed, key))).toBe(key)
    },
  )

  it('rejects a raw that is not text, an empty callId and an extra key', () => {
    expect(rejection({ ...unparsed, raw: 1 })).toBe('raw')
    expect(rejection({ ...unparsed, raw: null })).toBe('raw')
    expect(rejection({ ...unparsed, callId: '' })).toBe('callId')
    expect(rejection({ ...unparsed, name: null })).toBe('name')
    expect(rejection({ ...unparsed, payload: 1 })).toBe('extra')
  })
})

describe('tool_result', () => {
  it('admits the four closed keys', () => {
    expect(judgePart(result)).toEqual({ ok: result })
  })

  it.each(['id', 'visibility', 'callId'])('reports a missing %s by its name', key => {
    expect(rejection(without(result, key))).toBe(key)
  })

  it('rejects an empty callId, an extra key and a bad identity', () => {
    expect(rejection({ ...result, callId: '' })).toBe('callId')
    expect(rejection({ ...result, payload: 'x' })).toBe('extra')
    expect(rejection({ ...result, content: [] })).toBe('extra')
    expect(rejection({ ...result, id: '' })).toBe('id')
    expect(rejection({ ...result, visibility: { toHuman: true, toModel: true, x: 1 } })).toBe(
      'extra',
    )
  })
})

describe('judgePart shape guards', () => {
  it('admits no part with an accessor or a hidden own key, and calls no getter', () => {
    let called = false
    const withGetter = {
      ...without(call, 'callId'),
      get callId() {
        called = true
        return 'call_1'
      },
    }
    expect(rejection(withGetter)).toBe('json')
    expect(called).toBe(false)
    expect(
      rejection(
        Object.defineProperties({}, { kind: { value: 'tool_call' }, callId: { value: 'c' } }),
      ),
    ).toBe('json')
  })

  it('rejects a part that inherits its keys', () => {
    expect(rejection(Object.create(call))).toBe('json')
  })

  it('does not walk a deep value under an extra key', () => {
    let deep: unknown = 1
    for (let level = 0; level < 200_000; level += 1) deep = { next: deep }
    expect(rejection({ ...result, payload: deep })).toBe('extra')
    expect(rejection({ ...call, payload: deep })).toBe('extra')
    expect(rejection({ kind: 'text', id: 't', visibility, text: 'x', payload: deep })).toBe('extra')
  })

  it('names an unknown kind', () => {
    expect(rejection({ kind: 'tool_result_page' })).toBe('unknown')
  })
})

describe('arguments copy', () => {
  it('keeps a frozen copy that does not share the caller object', () => {
    const entry = { key: 'a', value: { kind: 'null' } }
    const given = { kind: 'object', entries: [entry] }
    const judged = judgePart({ ...call, arguments: given })
    if (!('ok' in judged) || judged.ok.kind !== 'tool_call') throw new Error('expected a call')
    const kept = judged.ok.arguments
    expect(kept).not.toBe(given)
    expect(Object.isFrozen(kept)).toBe(true)
    entry.key = 'changed'
    given.entries.push({ key: 'b', value: { kind: 'null' } })
    expect(kept).toEqual(args)
  })
})

describe('together with json-text', () => {
  it('admits what readJsonText produced and writes it back to a tree that reads equal', () => {
    const limits = {
      maxBytes: 10_000,
      maxDepth: 50,
      maxItems: 1_000,
      maxMembers: 100,
      maxStringLength: 1_000,
      maxNumberLength: 50,
    }
    const read = readJsonText('{"a":[1.0,"\\uD800",null,true],"b":{"c":-0.5e3}}', limits)
    if (read.kind !== 'ok') throw new Error('expected a value tree')
    const judged = judgePart({ ...call, arguments: read.value })
    if (!('ok' in judged) || judged.ok.kind !== 'tool_call') throw new Error('expected a call')
    const again = readJsonText(writeJsonText(judged.ok.arguments), limits)
    expect(again).toEqual({ kind: 'ok', value: read.value })
  })

  it.each([
    ['missing', { kind: 'array' }],
    ['type', { kind: 'string', value: 1 }],
    ['value', { kind: 'bogus' }],
    ['unknown-field', { kind: 'null', extra: 1 }],
    [
      'duplicate',
      {
        kind: 'object',
        entries: [
          { key: 'a', value: { kind: 'null' } },
          { key: 'a', value: { kind: 'null' } },
        ],
      },
    ],
    [
      'accessor',
      {
        kind: 'string',
        get value() {
          return 'x'
        },
      },
    ],
    [
      'unreadable',
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error('trap')
          },
        },
      ),
    ],
  ])('maps the %s failure to arguments and leaks no path', (_name, tree) => {
    expect(judgePart({ ...call, arguments: tree })).toEqual({ rejected: 'arguments' })
  })

  it('maps a cycle to arguments', () => {
    const cyclic: { kind: 'array'; items: unknown[] } = { kind: 'array', items: [] }
    cyclic.items.push(cyclic)
    expect(judgePart({ ...call, arguments: cyclic })).toEqual({ rejected: 'arguments' })
  })

  // Slow: building and walking a tree past the default visit limit of one million takes seconds.
  it('maps a budget failure to arguments', { tags: ['slow'] }, () => {
    let tree: unknown = { kind: 'null' }
    for (let level = 0; level < 1_000_001; level += 1) tree = { kind: 'array', items: [tree] }
    expect(judgePart({ ...call, arguments: tree })).toEqual({ rejected: 'arguments' })
  })
})
