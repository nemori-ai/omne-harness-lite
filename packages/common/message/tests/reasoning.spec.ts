import { describe, expect, it } from 'vitest'
import {
  REASONING_STATE_PAYLOAD_MAX_LENGTH,
  REPLAY_TAG_MAX_LENGTH,
  judgeCompaction,
  isReplayTag,
  judgeMessage,
  judgePart,
  parseRecordEntryRef,
  type AssistantMessage,
  type CompactionContext,
  type Message,
  type RecordEntryRef,
} from '@omne-harness/message'

/**
 * Cases that the reasoning state table in docs/public-api.md cannot say in a cell: values that
 * JSON cannot carry, how often an accessor is read, and the identity of what comes back. The
 * rules themselves are in that table.
 */
const id = 'msg_abcdefghijklmnopqrstuv'
const seen = { toHuman: true, toModel: true }
const thinking = { kind: 'thinking', id: 'k1', visibility: seen, text: 'x' }
const state = {
  kind: 'reasoning_state',
  id: 's1',
  visibility: { toHuman: false, toModel: true },
  payload: 'p',
  pairs: ['k1'],
}
const replay = { scope: 'sc', format: 'f1', at: [1] }

function assistant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    role: 'assistant',
    blocks: [thinking, { ...state }],
    replay: { ...replay },
    ...overrides,
  }
}

function admitted(input: Record<string, unknown>): AssistantMessage {
  const judged = judgeMessage(input)
  if (!('ok' in judged) || judged.ok.role !== 'assistant') throw new Error('expected assistant')
  return judged.ok
}

/** An accessor that answers from the list, one answer for each call, and counts the calls. */
function answering(answers: readonly unknown[]): { get: () => unknown; calls: () => number } {
  let calls = 0
  return {
    get: () => answers[Math.min(calls++, answers.length - 1)],
    calls: () => calls,
  }
}

function stateWith(pairs: unknown): Record<string, unknown> {
  return { ...state, pairs }
}

describe('the limits', () => {
  it('are in UTF-16 code units', () => {
    expect(REASONING_STATE_PAYLOAD_MAX_LENGTH).toBe(1048576)
    expect(REPLAY_TAG_MAX_LENGTH).toBe(256)
  })

  it('count a code unit, not a character, in the payload and in scope and format', () => {
    const wide = '\u{1F600}'
    expect(
      judgePart({ ...state, payload: wide.repeat(REASONING_STATE_PAYLOAD_MAX_LENGTH / 2) }),
    ).toHaveProperty('ok')
    expect(
      judgePart({ ...state, payload: wide.repeat(REASONING_STATE_PAYLOAD_MAX_LENGTH / 2 + 1) }),
    ).toEqual({
      rejected: 'payload',
    })
    const tag = wide.repeat(REPLAY_TAG_MAX_LENGTH / 2)
    expect(
      judgeMessage(assistant({ replay: { ...replay, scope: tag, format: tag } })),
    ).toHaveProperty('ok')
    expect(judgeMessage(assistant({ replay: { ...replay, scope: `${tag}x` } }))).toEqual({
      rejected: 'replay',
    })
  })
})

describe('isReplayTag', () => {
  it('is true only for a non-empty string of at most the longest length', () => {
    expect(isReplayTag('a')).toBe(true)
    expect(isReplayTag('x'.repeat(REPLAY_TAG_MAX_LENGTH))).toBe(true)
    expect(isReplayTag('')).toBe(false)
    expect(isReplayTag('x'.repeat(REPLAY_TAG_MAX_LENGTH + 1))).toBe(false)
    expect(isReplayTag(1)).toBe(false)
    expect(isReplayTag(null)).toBe(false)
    expect(isReplayTag(undefined)).toBe(false)
    expect(isReplayTag(['a'])).toBe(false)
  })
})

describe('judgePart on a reasoning state part', () => {
  it('admits it as a new object, and does not freeze the part', () => {
    const input = { ...state }
    const judged = judgePart(input)
    if (!('ok' in judged)) throw new Error('expected ok')
    expect(judged.ok).toEqual(input)
    expect(judged.ok).not.toBe(input)
    expect(Object.isFrozen(judged.ok)).toBe(false)
  })

  it('refuses pairs with an empty or a non-string item by itself, before any message check', () => {
    expect(judgePart(stateWith(['']))).toEqual({ rejected: 'pairs' })
    expect(judgePart(stateWith([1]))).toEqual({ rejected: 'pairs' })
  })

  it('takes pairs as a frozen copy that shares nothing with the input', () => {
    const pairs = ['k1']
    const judged = judgePart(stateWith(pairs))
    if (!('ok' in judged) || judged.ok.kind !== 'reasoning_state') throw new Error('expected ok')
    pairs.push('k2')
    expect(judged.ok.pairs).toEqual(['k1'])
    expect(Object.isFrozen(judged.ok.pairs)).toBe(true)
  })

  it('does not look at the other blocks, so a pair that names nothing is admitted here', () => {
    expect(judgePart(stateWith(['nowhere']))).toHaveProperty('ok')
  })

  it('refuses a part with an accessor, as json, before any field is read', () => {
    const part = { ...state }
    Object.defineProperty(part, 'payload', { enumerable: true, get: () => 'p' })
    expect(judgePart(part)).toEqual({ rejected: 'json' })
  })

  it('refuses pairs that hide what a read would do, and never calls the accessor', () => {
    const accessor = answering(['k1'])
    const withAccessor: unknown[] = []
    Object.defineProperty(withAccessor, 0, { enumerable: true, get: accessor.get })
    const hidden: unknown[] = ['k1']
    Object.defineProperty(hidden, 0, { enumerable: false, value: 'k1' })
    const named: unknown[] = ['k1']
    Object.assign(named, { extra: 'k2' })
    const symbolic: unknown[] = ['k1']
    Object.defineProperty(symbolic, Symbol('hidden'), { enumerable: true, value: 'k2' })
    const holey: unknown[] = []
    holey[1] = 'k1'
    for (const pairs of [withAccessor, hidden, named, symbolic, holey]) {
      expect(judgePart(stateWith(pairs))).toEqual({ rejected: 'pairs' })
    }
    expect(accessor.calls()).toBe(0)
  })

  it('refuses a part whose own key has no descriptor, as json, without throwing', () => {
    const hostile = new Proxy(
      {},
      { ownKeys: () => ['a'], getOwnPropertyDescriptor: () => undefined },
    )
    expect(judgePart(hostile)).toEqual({ rejected: 'json' })
    expect(judgeMessage(assistant({ blocks: [hostile, thinking], replay: undefined }))).toEqual({
      rejected: 'json',
      blockIndex: 0,
    })
  })

  it('does not look at a symbol key of the part itself, as for a tool part', () => {
    const part = { ...state, [Symbol('note')]: 1 }
    expect(judgePart(part)).toHaveProperty('ok')
  })
})

describe('the replay key of judgeMessage', () => {
  it('reads an accessor of replay once, and uses that one value for the checks and the copy', () => {
    const accessor = answering([{ ...replay }, 'not an object'])
    const input = assistant()
    delete input.replay
    Object.defineProperty(input, 'replay', { enumerable: true, get: accessor.get })
    const message = admitted(input)
    expect(accessor.calls()).toBe(1)
    expect(message.replay).toEqual(replay)
  })

  it('reads a value of undefined as no replay, whatever carries it, and reads it once', () => {
    const accessor = answering([undefined, { ...replay }])
    const input = assistant({ blocks: [{ kind: 'text', id: 't1', visibility: seen, text: 'x' }] })
    delete input.replay
    Object.defineProperty(input, 'replay', { enumerable: true, get: accessor.get })
    const message = admitted(input)
    expect(accessor.calls()).toBe(1)
    expect('replay' in message).toBe(false)
  })

  it('reads a replay that the input only inherits, as the in test says', () => {
    const input = Object.create({ replay: { ...replay } }) as Record<string, unknown>
    Object.assign(input, { id, role: 'assistant', blocks: [thinking, { ...state }] })
    expect(admitted(input).replay).toEqual(replay)
  })

  it('counts an own replay as extra when the input only inherits role assistant', () => {
    const input = Object.create({ role: 'assistant' }) as Record<string, unknown>
    Object.assign(input, { id, blocks: [thinking, { ...state }], replay: { ...replay } })
    expect(judgeMessage(input)).toEqual({ rejected: 'extra' })
  })

  it('does not read replay of another role, and does not count a hidden key as extra', () => {
    const user = {
      id,
      role: 'user',
      blocks: [{ kind: 'text', id: 't1', visibility: seen, text: 'x' }],
    }
    const accessor = answering([{ ...replay }])
    Object.defineProperty(user, 'replay', { enumerable: false, get: accessor.get })
    const judged = judgeMessage(user)
    expect(judged).toHaveProperty('ok')
    expect(accessor.calls()).toBe(0)
    expect('replay' in (judged as { ok: object }).ok).toBe(false)
  })

  it('refuses a replay that is not a plain object, and never calls an accessor of it', () => {
    class Described {
      scope = 'sc'
      format = 'f1'
      at = [1]
    }
    const accessor = answering(['sc'])
    const withAccessor = { format: 'f1', at: [1] }
    Object.defineProperty(withAccessor, 'scope', { enumerable: true, get: accessor.get })
    const hidden = { format: 'f1', at: [1] }
    Object.defineProperty(hidden, 'scope', { enumerable: false, value: 'sc' })
    const symbolic = { ...replay, [Symbol('note')]: 1 }
    const inherited = Object.create({ scope: 'sc' }) as Record<string, unknown>
    Object.assign(inherited, { format: 'f1', at: [1] })
    for (const bad of [new Described(), withAccessor, hidden, symbolic, inherited]) {
      expect(judgeMessage(assistant({ replay: bad }))).toEqual({ rejected: 'replay' })
    }
    expect(accessor.calls()).toBe(0)
  })

  it('admits a replay that has no prototype', () => {
    const bare = Object.assign(Object.create(null) as object, replay)
    expect(admitted(assistant({ replay: bare })).replay).toEqual(replay)
  })

  it('refuses an at that hides what a read would do, and never calls an accessor of it', () => {
    const accessor = answering([1])
    const withAccessor: unknown[] = []
    Object.defineProperty(withAccessor, 0, { enumerable: true, get: accessor.get })
    const hidden: unknown[] = [1]
    Object.defineProperty(hidden, 0, { enumerable: false, value: 1 })
    const named: unknown[] = [1]
    Object.assign(named, { extra: 2 })
    const symbolic: unknown[] = [1]
    Object.defineProperty(symbolic, Symbol('hidden'), { enumerable: true, value: 2 })
    const holey: unknown[] = []
    holey[1] = 1
    for (const at of [withAccessor, hidden, named, symbolic, holey]) {
      expect(judgeMessage(assistant({ replay: { ...replay, at } }))).toEqual({ rejected: 'replay' })
    }
    expect(accessor.calls()).toBe(0)
  })
})

describe('the success value', () => {
  it('has a new replay and a new pairs, and leaves the input as it was', () => {
    const input = assistant()
    const inputReplay = input.replay
    const message = admitted(input)
    expect(message.replay).toEqual(replay)
    expect(message.replay).not.toBe(inputReplay)
    expect(Object.isFrozen(inputReplay)).toBe(false)
    expect(Object.isFrozen(message.blocks)).toBe(false)
    const part = message.blocks[1]
    expect(part).toMatchObject({ kind: 'reasoning_state', pairs: ['k1'] })
    expect(part).not.toBe((input.blocks as unknown[])[1])
    expect(Object.isFrozen(part)).toBe(false)
  })
})

describe('what a retained message keeps', () => {
  function ref(raw: string): RecordEntryRef {
    const parsed = parseRecordEntryRef(raw)
    if (parsed === null) throw new Error('empty ref')
    return parsed
  }

  const summary = {
    id,
    role: 'compaction',
    blocks: [{ kind: 'text', id: 't1', visibility: seen, text: 'summary' }],
    covers: { from: 'e1', to: 'e2' },
    retained: ['e1'],
    derivation: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
  }

  function context(...messages: Message[]): CompactionContext {
    return {
      origin: ref('e1'),
      base: { kind: 'initial' },
      covered: messages.map((message, at) => ({ ref: ref(`e${at + 1}`), message })),
      after: [],
      open: [],
    }
  }

  it('is admitted by judgeCompaction with its reasoning state and replay as they were', () => {
    const kept = admitted(assistant())
    const dropped = admitted(assistant({ id: 'msg_bbcdefghijklmnopqrstuv' }))
    const judged = judgeCompaction(summary, context(kept, dropped))
    expect(judged).toHaveProperty('ok')
    expect(kept.replay).toEqual(replay)
    expect(kept.blocks[1]).toMatchObject({ kind: 'reasoning_state', payload: 'p', pairs: ['k1'] })
  })

  it('does not let the summary carry reasoning state', () => {
    const withState = { ...summary, blocks: [...summary.blocks, { ...state }] }
    expect(judgeMessage(withState)).toEqual({ rejected: 'misplaced-part', blockIndex: 1 })
  })
})
