import { describe, expect, it } from 'vitest'
import {
  isCompactionMessage,
  judgeCompaction,
  judgeMessage,
  parseRecordEntryRef,
  type CompactionContext,
  type CompactionMessage,
  type Message,
  type RecordEntryRef,
} from '@omne-harness/message'

/**
 * Cases that the compaction table in docs/public-api.md cannot say in a cell: values that JSON
 * cannot carry, and the identity of what comes back. The rules themselves are in that table.
 */
const id = 'msg_abcdefghijklmnopqrstuv'
const visibility = { toHuman: true, toModel: true }
const text = { kind: 'text', id: 't1', visibility, text: 'summary' }
const derivation = { owner: 'o', record: 'r', revision: '1', digest: 'd' }

function compaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    role: 'compaction',
    blocks: [text],
    covers: { from: 'e1', to: 'e1' },
    retained: [],
    derivation: { ...derivation },
    ...overrides,
  }
}

function admitted(overrides: Record<string, unknown> = {}): CompactionMessage {
  const judged = judgeMessage(compaction(overrides))
  if (!('ok' in judged) || !isCompactionMessage(judged.ok)) throw new Error('expected compaction')
  return judged.ok
}

function ref(raw: string): RecordEntryRef {
  const parsed = parseRecordEntryRef(raw)
  if (parsed === null) throw new Error('empty ref')
  return parsed
}

function plain(role: 'user' | 'assistant' | 'tool', blocks: unknown[]): Message {
  const judged = judgeMessage({ id, role, blocks })
  if (!('ok' in judged)) throw new Error(`fixture refused: ${judged.rejected}`)
  return judged.ok
}

const user = (): Message => plain('user', [{ ...text, id: 'b1' }])
const call = (callId: string): Message =>
  plain('assistant', [
    { kind: 'tool_call', id: 'c1', visibility, callId, name: 'echo', arguments: { kind: 'null' } },
  ])
const answer = (callId: string): Message =>
  plain('tool', [{ kind: 'tool_result', id: 'r1', visibility, callId }])

function history(
  entries: readonly (readonly [string, Message | null])[],
  after: readonly Message[] = [],
  open: readonly string[] = [],
): CompactionContext {
  return {
    covered: entries.map(([at, message]) => ({ ref: ref(at), message })),
    after,
    open: open.map(ref),
  }
}

describe('parseRecordEntryRef', () => {
  it('refuses the empty string and keeps any other text as it is', () => {
    expect(parseRecordEntryRef('')).toBeNull()
    expect(parseRecordEntryRef(' a b ')).toBe(' a b ')
    expect(parseRecordEntryRef('entry/17#x')).toBe('entry/17#x')
  })
})

describe('isCompactionMessage', () => {
  it('is true for an admitted compaction message and false for the other roles', () => {
    expect(isCompactionMessage(admitted())).toBe(true)
    expect(isCompactionMessage(user())).toBe(false)
  })

  it('is false for a compaction-role message that lacks the three keys', () => {
    const bare: Message = { ...user(), role: 'compaction' }
    expect(isCompactionMessage(bare)).toBe(false)
  })

  it('is false when only some of the three keys exist, or when the role is another one', () => {
    const { covers, retained } = admitted()
    expect(isCompactionMessage(Object.assign(user(), { covers }))).toBe(false)
    expect(
      isCompactionMessage({ ...Object.assign(user(), { covers, retained }), role: 'compaction' }),
    ).toBe(false)
    expect(isCompactionMessage({ ...admitted(), role: 'user' })).toBe(false)
  })
})

describe('the fields of a message are read once', () => {
  function withAccessor(input: Record<string, unknown>, key: string, answers: readonly unknown[]) {
    let calls = 0
    Object.defineProperty(input, key, {
      enumerable: true,
      get: () => {
        calls += 1
        return answers[Math.min(calls, answers.length) - 1]
      },
    })
    return () => calls
  }

  it.each(['id', 'role', 'blocks', 'covers', 'retained', 'derivation'])(
    'calls the accessor of %s once and admits the message',
    key => {
      const input = compaction()
      const calls = withAccessor(input, key, [input[key]])
      expect(judgeMessage(input)).toHaveProperty('ok')
      expect(calls()).toBe(1)
    },
  )

  it('uses the one answer of a role that changes: the key set and the success value agree', () => {
    const flips = compaction()
    const calls = withAccessor(flips, 'role', ['compaction', 'user'])
    const judged = judgeMessage(flips)
    expect(calls()).toBe(1)
    expect(judged).toMatchObject({ ok: { role: 'compaction' } })
    expect(judged).toHaveProperty('ok.covers')

    const bogus = compaction()
    withAccessor(bogus, 'role', ['compaction', 'bogus'])
    expect(judgeMessage(bogus)).toMatchObject({ ok: { role: 'compaction' } })
  })

  it('takes a role that is first another one as that one, and the three keys as extra', () => {
    const input = compaction()
    const calls = withAccessor(input, 'role', ['user', 'compaction'])
    expect(judgeMessage(input)).toEqual({ rejected: 'extra' })
    expect(calls()).toBe(1)
  })
})

describe('the shape of a message', () => {
  it.each([
    ['a string', 'x'],
    ['null', null],
    ['an array', []],
  ])('refuses %s', (_name, input) => {
    expect(judgeMessage(input)).toEqual({ rejected: 'shape' })
  })

  it.each([
    ['id', 1],
    ['role', 1],
    ['blocks', 'x'],
  ])('refuses a %s of the wrong type', (key, value) => {
    expect(judgeMessage({ id, role: 'user', blocks: [text], [key]: value })).toEqual({
      rejected: 'shape',
    })
  })

  it('reads the three keys only when the role is the string compaction', () => {
    expect(judgeMessage(compaction({ role: 1 }))).toEqual({ rejected: 'extra' })
    expect(judgeMessage(compaction({ role: ['compaction'] }))).toEqual({ rejected: 'extra' })
  })
})

describe('the three compaction keys of judgeMessage', () => {
  it.each([
    ['a symbol key', () => Object.assign({ from: 'e1', to: 'e1' }, { [Symbol('s')]: 1 })],
    ['a prototype that is not plain', () => Object.create({ from: 'e1', to: 'e1' })],
    [
      'a non-enumerable key',
      () => Object.defineProperties({ from: 'e1' }, { to: { value: 'e1', enumerable: false } }),
    ],
    [
      'a class instance',
      () =>
        new (class Range {
          from = 'e1'
          to = 'e1'
        })(),
    ],
    ['an array', () => ['e1', 'e1']],
  ])('refuses covers with %s', (_name, build) => {
    expect(judgeMessage(compaction({ covers: build() }))).toEqual({ rejected: 'covers' })
  })

  it('refuses a derivation with an accessor, and does not call it', () => {
    let calls = 0
    const guarded = { ...derivation }
    Object.defineProperty(guarded, 'digest', {
      enumerable: true,
      get: () => {
        calls += 1
        return 'd'
      },
    })
    expect(judgeMessage(compaction({ derivation: guarded }))).toEqual({ rejected: 'derivation' })
    expect(calls).toBe(0)
  })

  it.each(['owner', 'record', 'revision', 'digest'])(
    'refuses a derivation whose %s is empty, not a string, or missing',
    key => {
      for (const bad of ['', 1, null]) {
        expect(judgeMessage(compaction({ derivation: { ...derivation, [key]: bad } }))).toEqual({
          rejected: 'derivation',
        })
      }
      const swapped = { ...derivation, other: 'x' } as Record<string, unknown>
      delete swapped[key]
      expect(judgeMessage(compaction({ derivation: swapped }))).toEqual({
        rejected: 'derivation',
      })
    },
  )

  it.each(['from', 'to'])('refuses covers whose %s is empty, not a string, or missing', key => {
    for (const bad of ['', 1, null]) {
      expect(judgeMessage(compaction({ covers: { from: 'e1', to: 'e1', [key]: bad } }))).toEqual({
        rejected: 'covers',
      })
    }
    const swapped: Record<string, unknown> = { from: 'e1', to: 'e1', size: 'e1' }
    delete swapped[key]
    expect(judgeMessage(compaction({ covers: swapped }))).toEqual({ rejected: 'covers' })
  })

  it('refuses a retained array with a hole or a non-string item', () => {
    const sparse: string[] = []
    sparse[1] = 'e2'
    expect(judgeMessage(compaction({ retained: sparse }))).toEqual({ rejected: 'retained' })
    expect(judgeMessage(compaction({ retained: ['e1', 2] }))).toEqual({ rejected: 'retained' })
  })

  it('keeps no input object: each key is a new frozen copy', () => {
    const input = compaction({ retained: ['e1'] })
    const judged = admitted({ retained: input.retained, covers: input.covers })
    expect(judged.retained).not.toBe(input.retained)
    expect(judged.covers).not.toBe(input.covers)
    expect(Object.isFrozen(judged.covers)).toBe(true)
    expect(Object.isFrozen(judged.retained)).toBe(true)
    expect(Object.isFrozen(judged.derivation)).toBe(true)
  })

  it('reports a failed block after the keys, and a failed key before a failed block', () => {
    const bad = { ...text, visibility: { toHuman: true } }
    expect(judgeMessage(compaction({ blocks: [bad] }))).toEqual({
      rejected: 'visibility',
      blockIndex: 0,
    })
    expect(judgeMessage(compaction({ blocks: [bad], covers: 'e1' }))).toEqual({
      rejected: 'covers',
    })
  })

  it('does not admit a tool part in the summary', () => {
    const marker = { kind: 'tool_result', id: 'r1', visibility, callId: 'k' }
    expect(judgeMessage(compaction({ blocks: [text, marker] }))).toEqual({
      rejected: 'tool-blocks',
      blockIndex: 1,
    })
  })
})

describe('judgeCompaction', () => {
  it('returns the judgeMessage value, a frozen copy of the input keys', () => {
    const input = compaction({ retained: ['e2'] })
    const context = history([
      ['e1', user()],
      ['e2', user()],
    ])
    const judged = judgeCompaction({ ...input, covers: { from: 'e1', to: 'e2' } }, context)
    if (!('ok' in judged)) throw new Error(`refused: ${judged.rejected}`)
    expect(judged.ok.retained).toEqual(['e2'])
    expect(judged.ok.retained).not.toBe(input.retained)
    expect(Object.isFrozen(judged.ok.retained)).toBe(true)
  })

  it('reports a shape failure as message, whatever the context holds', () => {
    const context = history([['e1', user()]])
    expect(judgeCompaction(compaction({ covers: 'e1' }), context)).toEqual({
      rejected: 'message',
      ref: null,
    })
    expect(judgeCompaction('x', context)).toEqual({ rejected: 'message', ref: null })
    expect(judgeCompaction(null, context)).toEqual({ rejected: 'message', ref: null })
  })

  it('pairs each answer with the call before it: one kept answer of two is a failure at the call', () => {
    const context = history([
      ['e1', user()],
      ['e2', call('k')],
      ['e3', answer('k')],
      ['e4', answer('k')],
    ])
    const message = compaction({ covers: { from: 'e1', to: 'e4' }, retained: ['e2', 'e3'] })
    expect(judgeCompaction(message, context)).toEqual({ rejected: 'pairing', ref: 'e2' })
    const kept = compaction({ covers: { from: 'e1', to: 'e4' }, retained: ['e2', 'e3', 'e4'] })
    expect(judgeCompaction(kept, context)).toHaveProperty('ok')
  })

  it('does not pair an answer with a call that comes after it', () => {
    const context = history([['e1', answer('k')]], [call('k')])
    expect(judgeCompaction(compaction(), context)).toHaveProperty('ok')
  })

  it('does not pair an answer with a call of another callId', () => {
    const context = history([
      ['e1', call('k')],
      ['e2', answer('j')],
    ])
    const message = compaction({ covers: { from: 'e1', to: 'e2' }, retained: ['e2'] })
    expect(judgeCompaction(message, context)).toHaveProperty('ok')
  })

  it('lets a null entry pass the pairing and the open-work steps when it is not kept', () => {
    const context = history(
      [
        ['e1', null],
        ['e2', user()],
      ],
      [],
      ['e2'],
    )
    const message = compaction({ covers: { from: 'e1', to: 'e2' }, retained: ['e2'] })
    expect(judgeCompaction(message, context)).toHaveProperty('ok')
  })

  it('does not let an incomplete call stand in for the call before it', () => {
    const incomplete = plain('assistant', [
      {
        kind: 'tool_call_incomplete',
        id: 'i1',
        visibility: { toHuman: false, toModel: false },
        callId: 'k',
        name: 'echo',
        partial: '{',
      },
    ])
    const context = history([
      ['e1', user()],
      ['e2', call('k')],
      ['e3', incomplete],
      ['e4', answer('k')],
    ])
    const message = compaction({ covers: { from: 'e1', to: 'e4' }, retained: ['e4'] })
    expect(judgeCompaction(message, context)).toEqual({ rejected: 'pairing', ref: 'e4' })
  })

  it('reports the pair whose answer comes first in the history', () => {
    const context = history([
      ['e1', call('j')],
      ['e2', answer('j')],
      ['e3', call('k')],
      ['e4', answer('k')],
    ])
    const range = { from: 'e1', to: 'e4' }
    expect(judgeCompaction(compaction({ covers: range, retained: ['e1', 'e4'] }), context)).toEqual(
      { rejected: 'pairing', ref: 'e1' },
    )
    expect(judgeCompaction(compaction({ covers: range, retained: ['e2', 'e3'] }), context)).toEqual(
      { rejected: 'pairing', ref: 'e2' },
    )
  })

  it('takes a message as model-readable when any one block goes to the model', () => {
    const hidden = { toHuman: false, toModel: false }
    const markerShown = plain('tool', [
      { kind: 'tool_result', id: 'r1', visibility, callId: 'k' },
      { ...text, id: 'b1', visibility: hidden },
    ])
    const mixed = plain('user', [
      { ...text, id: 'b1', visibility: hidden },
      { ...text, id: 'b2' },
    ])
    const callShown = plain('assistant', [
      { ...text, id: 'b1', visibility: hidden },
      {
        kind: 'tool_call',
        id: 'c1',
        visibility,
        callId: 'k',
        name: 'echo',
        arguments: { kind: 'null' },
      },
    ])
    const context = history([
      ['e1', mixed],
      ['e2', callShown],
      ['e3', markerShown],
    ])
    const range = { from: 'e1', to: 'e3' }
    expect(
      judgeCompaction(compaction({ covers: range, retained: ['e1', 'e2', 'e3'] }), context),
    ).toHaveProperty('ok')
  })

  it('does not take a tool message with no block for the model as model-readable', () => {
    const hidden = { toHuman: false, toModel: false }
    const silent = plain('tool', [
      { kind: 'tool_result', id: 'r1', visibility: hidden, callId: 'k' },
      { ...text, id: 'b1', visibility: hidden },
    ])
    const context = history([['e1', silent]])
    expect(judgeCompaction(compaction({ retained: ['e1'] }), context)).toEqual({
      rejected: 'retained-not-model',
      ref: 'e1',
    })
  })

  it('checks the order of a retained item before it checks whether the item is model-readable', () => {
    const context = history([
      ['e1', null],
      ['e2', user()],
    ])
    const message = compaction({ covers: { from: 'e1', to: 'e2' }, retained: ['e2', 'e1'] })
    expect(judgeCompaction(message, context)).toEqual({ rejected: 'retained-order', ref: 'e1' })
  })
})
