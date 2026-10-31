import { describe, expect, it } from 'vitest'
import { REPLAY_TAG_MAX_LENGTH, judgeMessage, type Message } from '@omne-harness/message'
import {
  type ForeignThinking,
  type ProfileSupplier,
  type ReplayDeclaration,
} from '@omne-harness/model-contract'
import {
  continuedMessages,
  judgeReplayDeclaration,
  projectReplay,
  type ReplayProjectionInput,
} from '@omne-harness/model-contract/provider'

// The test names are literals: the mutation runner finds a test by its static name.
const SECRET = 'PAYLOAD-THAT-MUST-NOT-LEAK'
const seen = { toHuman: true, toModel: true }
const hidden = { toHuman: false, toModel: true }

function messageId(letter: string): string {
  return `msg_${letter.repeat(22)}`
}

function built(value: unknown): Message {
  const judged = judgeMessage(value)
  if (!('ok' in judged)) throw new Error(`fixture message: ${JSON.stringify(judged)}`)
  return judged.ok
}

/** thinking at 0, a state part at 1 paired with it, and a text block at 2. */
function withState(letter: string, scope: string, format = 'f1'): Message {
  return built({
    id: messageId(letter),
    role: 'assistant',
    blocks: [
      { kind: 'thinking', id: `k-${letter}`, visibility: seen, text: 'thought' },
      {
        kind: 'reasoning_state',
        id: `s-${letter}`,
        visibility: hidden,
        payload: SECRET,
        pairs: [`k-${letter}`],
      },
      { kind: 'text', id: `t-${letter}`, visibility: seen, text: 'answer' },
    ],
    replay: { scope, format, at: [1] },
  })
}

function thinkingOnly(letter: string, scope: string | undefined): Message {
  return built({
    id: messageId(letter),
    role: 'assistant',
    blocks: [{ kind: 'thinking', id: `k-${letter}`, visibility: seen, text: 'thought' }],
    ...(scope === undefined ? {} : { replay: { scope, format: 'f1', at: [] } }),
  })
}

function plain(letter: string): Message {
  return built({
    id: messageId(letter),
    role: 'assistant',
    blocks: [{ kind: 'text', id: `t-${letter}`, visibility: seen, text: 'answer' }],
  })
}

function user(letter: string): Message {
  return built({
    id: messageId(letter),
    role: 'user',
    blocks: [{ kind: 'text', id: `t-${letter}`, visibility: seen, text: 'question' }],
  })
}

function declaration(
  produces: string,
  accepts: readonly string[] = [produces],
  foreignThinking: ForeignThinking = 'omit',
): ReplayDeclaration {
  return { produces, accepts, foreignThinking }
}

function project(messages: readonly Message[], overrides: Partial<ReplayProjectionInput> = {}) {
  return projectReplay({
    messages,
    declaration: declaration('A'),
    formats: new Set(['f1']),
    off: false,
    resent: new Set(),
    ...overrides,
  })
}

describe('projectReplay: when a message can continue', () => {
  it('continues a message whose scope is accepted and whose format is known', () => {
    const result = project([withState('a', 'A')])
    expect(result.treatments).toEqual([
      {
        index: 0,
        message: messageId('a'),
        continuable: true,
        carry: [1],
        thinking: 'native',
      },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('does not continue a message whose scope is not accepted, and says so once', () => {
    const result = project([withState('a', 'B')])
    expect(result.treatments[0]).toEqual({
      index: 0,
      message: messageId('a'),
      continuable: false,
      omit: [1],
      thinking: 'omit',
    })
    expect(result.diagnostics).toEqual([
      { message: messageId('a'), scope: 'B', format: 'f1', omittedParts: 1 },
    ])
  })

  it('accepts a scope that is listed in accepts but is not the produced one', () => {
    const result = project([withState('a', 'B')], { declaration: declaration('A', ['A', 'B']) })
    expect(result.treatments[0]).toMatchObject({ continuable: true, carry: [1] })
  })

  it('does not continue a message whose format the adapter does not know', () => {
    const result = project([withState('a', 'A', 'other')])
    expect(result.treatments[0]).toMatchObject({ continuable: false, omit: [1] })
    expect(result.diagnostics).toEqual([
      { message: messageId('a'), scope: 'A', format: 'other', omittedParts: 1 },
    ])
  })

  it('does not continue a message that a rejected dispatch continued', () => {
    const result = project([withState('a', 'A'), withState('b', 'A')], {
      resent: new Set([withState('a', 'A').id]),
    })
    expect(result.treatments.map(item => item.continuable)).toEqual([false, true])
    expect(result.diagnostics.map(item => item.message)).toEqual([messageId('a')])
  })

  it('does not continue any message when replay is off, even a known scope and format', () => {
    const result = project([withState('a', 'A'), thinkingOnly('b', 'A')], { off: true })
    expect(result.treatments.map(item => item.continuable)).toEqual([false, false])
    expect(result.treatments.map(item => ('omit' in item ? item.omit : null))).toEqual([[1], []])
    expect(result.diagnostics.map(item => item.message)).toEqual([messageId('a')])
  })
})

describe('projectReplay: messages without state parts', () => {
  it('continues a message with only thinking and writes the thinking natively', () => {
    const result = project([thinkingOnly('a', 'A')])
    expect(result.treatments[0]).toEqual({
      index: 0,
      message: messageId('a'),
      continuable: true,
      carry: [],
      thinking: 'native',
    })
    expect(result.diagnostics).toEqual([])
  })

  it('treats the thinking of an unaccepted thinking-only message as foreign without a diagnostic', () => {
    const result = project([thinkingOnly('a', 'B')], {
      declaration: declaration('A', ['A'], 'text'),
    })
    expect(result.treatments[0]).toMatchObject({ continuable: false, omit: [], thinking: 'text' })
    expect(result.diagnostics).toEqual([])
  })

  it('treats the thinking of a message without replay as foreign', () => {
    const result = project([thinkingOnly('a', undefined)], {
      declaration: declaration('A', ['A'], 'adapter'),
    })
    expect(result.treatments[0]).toMatchObject({
      continuable: false,
      omit: [],
      thinking: 'adapter',
    })
    expect(result.diagnostics).toEqual([])
  })

  it('gives a message without thinking or replay the same unremarkable treatment', () => {
    const result = project([plain('a')])
    expect(result.treatments[0]).toEqual({
      index: 0,
      message: messageId('a'),
      continuable: false,
      omit: [],
      thinking: 'omit',
    })
    expect(result.diagnostics).toEqual([])
  })

  it('gives treatments only to assistant messages and keeps their input positions', () => {
    const result = project([user('u'), withState('a', 'A'), user('v'), plain('b')])
    expect(result.treatments.map(item => [item.index, item.message])).toEqual([
      [1, messageId('a')],
      [3, messageId('b')],
    ])
  })
})

describe('projectReplay: foreign thinking', () => {
  const foreign = withState('a', 'B')

  it('omit leaves the foreign thinking out and still omits the state part', () => {
    const result = project([foreign], { declaration: declaration('A', ['A'], 'omit') })
    expect(result.treatments[0]).toMatchObject({ thinking: 'omit', omit: [1] })
  })

  it('text writes the foreign thinking as plain text', () => {
    const result = project([foreign], { declaration: declaration('A', ['A'], 'text') })
    expect(result.treatments[0]).toMatchObject({ thinking: 'text', omit: [1] })
  })

  it('adapter hands the foreign thinking to the adapter without a signature', () => {
    const result = project([foreign], { declaration: declaration('A', ['A'], 'adapter') })
    expect(result.treatments[0]).toMatchObject({ thinking: 'adapter', omit: [1] })
  })

  it('does not apply the rule to a message that can continue', () => {
    const result = project([withState('a', 'A')], { declaration: declaration('A', ['A'], 'text') })
    expect(result.treatments[0]).toMatchObject({ thinking: 'native' })
  })
})

describe('projectReplay: a history of A then B then A', () => {
  const history = [withState('a', 'A'), withState('b', 'B'), withState('c', 'A')]

  it('continues the A messages when the target produces A', () => {
    const result = project(history, { declaration: declaration('A') })
    expect(result.treatments.map(item => item.continuable)).toEqual([true, false, true])
    expect(result.diagnostics.map(item => item.message)).toEqual([messageId('b')])
  })

  it('continues the B message when the target produces B', () => {
    const result = project(history, { declaration: declaration('B') })
    expect(result.treatments.map(item => item.continuable)).toEqual([false, true, false])
    expect(result.diagnostics.map(item => item.message)).toEqual([messageId('a'), messageId('c')])
  })

  it('continues nothing when the target accepts neither A nor B', () => {
    const result = project(history, { declaration: declaration('C') })
    expect(result.treatments.map(item => item.continuable)).toEqual([false, false, false])
    expect(result.diagnostics).toHaveLength(3)
  })

  it('continues all three when the target accepts both', () => {
    const result = project(history, { declaration: declaration('B', ['B', 'A']) })
    expect(result.treatments.map(item => item.continuable)).toEqual([true, true, true])
    expect(result.diagnostics).toEqual([])
  })
})

describe('projectReplay: what leaves the function', () => {
  it('gives diagnostics exactly the four keys and no payload', () => {
    const result = project([withState('a', 'B')])
    expect(Object.keys(result.diagnostics[0] ?? {}).sort()).toEqual([
      'format',
      'message',
      'omittedParts',
      'scope',
    ])
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })

  it('counts the omitted parts of a message that has several', () => {
    const several = built({
      id: messageId('a'),
      role: 'assistant',
      blocks: [
        { kind: 'reasoning_state', id: 's1', visibility: hidden, payload: SECRET, pairs: [] },
        { kind: 'text', id: 't1', visibility: seen, text: 'x' },
        { kind: 'reasoning_state', id: 's2', visibility: hidden, payload: SECRET, pairs: [] },
      ],
      replay: { scope: 'B', format: 'f1', at: [0, 2] },
    })
    const result = project([several])
    expect(result.treatments[0]).toMatchObject({ omit: [0, 2] })
    expect(result.diagnostics[0]).toMatchObject({ omittedParts: 2 })
  })

  it('freezes the projection and does not change the messages', () => {
    const messages = [withState('a', 'A')]
    const before = JSON.stringify(messages)
    const result = project(messages)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.treatments)).toBe(true)
    expect(Object.isFrozen(result.treatments[0])).toBe(true)
    expect(JSON.stringify(messages)).toBe(before)
  })
})

describe('continuedMessages', () => {
  it('lists the messages that continue, so that a re-dispatch can leave them out', () => {
    const history = [withState('a', 'A'), withState('b', 'B'), thinkingOnly('c', 'A')]
    const first = project(history)
    const continued = continuedMessages(first)
    expect([...continued]).toEqual([messageId('a'), messageId('c')])
    const again = project(history, { resent: continued })
    expect(again.treatments.map(item => item.continuable)).toEqual([false, false, false])
    expect(again.diagnostics.map(item => item.message)).toEqual([messageId('a'), messageId('b')])
  })
})

function supplier(replay?: ProfileSupplier['replay']): ProfileSupplier {
  const base = {
    adoption: { owner: 'o', name: 'n', revision: '1', digest: 'd' },
    recipient: 'vendor',
    model: 'model-1',
  }
  return replay === undefined ? base : { ...base, replay }
}

describe('judgeReplayDeclaration: the expanded declaration', () => {
  function expanded(replay?: ProfileSupplier['replay']): unknown {
    const judged = judgeReplayDeclaration(supplier(replay), 0)
    if (!('ok' in judged)) throw new Error(`fixture declaration: ${JSON.stringify(judged)}`)
    return judged.ok
  }

  it('defaults to the exact model identity, accepting only itself, omitting foreign thinking', () => {
    expect(expanded()).toEqual({
      produces: 'vendor/model-1',
      accepts: ['vendor/model-1'],
      foreignThinking: 'omit',
    })
  })

  it('defaults accepts to the declared produces', () => {
    expect(expanded({ produces: 'family' })).toEqual({
      produces: 'family',
      accepts: ['family'],
      foreignThinking: 'omit',
    })
  })

  it('keeps every declared item', () => {
    const declared = { produces: 'p', accepts: ['q', 'p'], foreignThinking: 'text' } as const
    expect(expanded(declared)).toEqual(declared)
  })

  it('returns a frozen declaration with a frozen copy of accepts', () => {
    const accepts = ['p']
    const result = expanded({ produces: 'p', accepts }) as ReplayDeclaration
    accepts.push('q')
    expect(result.accepts).toEqual(['p'])
    expect(Object.isFrozen(result.accepts)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
  })
})

describe('judgeReplayDeclaration', () => {
  const tooLong = 'x'.repeat(REPLAY_TAG_MAX_LENGTH + 1)
  const longest = 'x'.repeat(REPLAY_TAG_MAX_LENGTH)

  function invalid(reason: string, index = 2) {
    return { failure: { kind: 'invalid', field: `suppliers[${index}].replay`, reason } }
  }

  it('accepts the defaults and returns the expanded declaration', () => {
    expect(judgeReplayDeclaration(supplier(), 0)).toEqual({
      ok: { produces: 'vendor/model-1', accepts: ['vendor/model-1'], foreignThinking: 'omit' },
    })
  })

  it('accepts tags of exactly the longest length', () => {
    const result = judgeReplayDeclaration(supplier({ produces: longest }), 0)
    expect(result).toMatchObject({ ok: { produces: longest } })
  })

  it('rejects an empty produces', () => {
    expect(judgeReplayDeclaration(supplier({ produces: '' }), 2)).toEqual(invalid('produces'))
  })

  it('rejects a produces that is too long', () => {
    expect(judgeReplayDeclaration(supplier({ produces: tooLong }), 2)).toEqual(invalid('produces'))
  })

  it('rejects a default produces that is too long', () => {
    const long = { ...supplier(), model: 'm'.repeat(REPLAY_TAG_MAX_LENGTH) }
    expect(judgeReplayDeclaration(long, 2)).toEqual(invalid('produces'))
  })

  it('rejects an empty item of accepts', () => {
    expect(judgeReplayDeclaration(supplier({ produces: 'p', accepts: ['p', ''] }), 2)).toEqual(
      invalid('accepts'),
    )
  })

  it('rejects an item of accepts that is too long', () => {
    expect(judgeReplayDeclaration(supplier({ produces: 'p', accepts: ['p', tooLong] }), 2)).toEqual(
      invalid('accepts'),
    )
  })

  it('rejects a repeated item of accepts', () => {
    expect(
      judgeReplayDeclaration(supplier({ produces: 'p', accepts: ['p', 'q', 'q'] }), 2),
    ).toEqual(invalid('accepts-duplicate'))
  })

  it('rejects accepts that lacks produces', () => {
    expect(judgeReplayDeclaration(supplier({ produces: 'p', accepts: ['q'] }), 2)).toEqual(
      invalid('accepts-lacks-produces'),
    )
  })

  it('rejects empty accepts, which lacks produces', () => {
    expect(judgeReplayDeclaration(supplier({ produces: 'p', accepts: [] }), 2)).toEqual(
      invalid('accepts-lacks-produces'),
    )
  })

  it('accepts each of the three foreign-thinking values', () => {
    for (const foreignThinking of ['omit', 'text', 'adapter'] as const) {
      expect(judgeReplayDeclaration(supplier({ foreignThinking }), 2)).toMatchObject({
        ok: { foreignThinking },
      })
    }
  })

  it('rejects a foreign-thinking value outside the three', () => {
    const odd = { foreignThinking: 'drop' } as unknown as ProfileSupplier['replay']
    expect(judgeReplayDeclaration(supplier(odd), 2)).toEqual(invalid('foreign-thinking'))
  })

  it('reports produces before accepts when both fail', () => {
    expect(judgeReplayDeclaration(supplier({ produces: '', accepts: ['p', ''] }), 2)).toEqual(
      invalid('produces'),
    )
  })

  it('reports a repeated item before a missing produces when both fail', () => {
    expect(judgeReplayDeclaration(supplier({ produces: 'p', accepts: ['q', 'q'] }), 2)).toEqual(
      invalid('accepts-duplicate'),
    )
  })

  it('rejects a stored replay of the wrong shape instead of reading it loosely', () => {
    const stored = (value: unknown) => supplier(value as ProfileSupplier['replay'])
    expect(judgeReplayDeclaration(stored({ produces: 'a', accepts: 'ab' }), 2)).toEqual(
      invalid('accepts'),
    )
    expect(judgeReplayDeclaration(stored({ accepts: 5 }), 2)).toEqual(invalid('accepts'))
    expect(judgeReplayDeclaration(stored({ accepts: null }), 2)).toEqual(invalid('accepts'))
    expect(judgeReplayDeclaration(stored({ produces: null }), 2)).toEqual(invalid('produces'))
    expect(judgeReplayDeclaration(stored({ produce: 'p' }), 2)).toEqual(invalid('replay'))
    expect(judgeReplayDeclaration(stored(null), 2)).toEqual(invalid('replay'))
    expect(judgeReplayDeclaration(stored(5), 2)).toEqual(invalid('replay'))
    expect(judgeReplayDeclaration(stored(['p']), 2)).toEqual(invalid('replay'))
    expect(judgeReplayDeclaration(stored({ produces: 'p', extra: 1 }), 2)).toEqual(
      invalid('replay'),
    )
    expect(judgeReplayDeclaration(stored({ produces: 'p', accepts: ['p', 3] }), 2)).toEqual(
      invalid('accepts'),
    )
    // eslint-disable-next-line no-sparse-arrays
    expect(judgeReplayDeclaration(stored({ produces: 'p', accepts: ['p', , 'q'] }), 2)).toEqual(
      invalid('accepts'),
    )
  })

  it('rejects a foreign-thinking of null as foreign-thinking, not as the default', () => {
    const stored = (value: unknown) => supplier(value as ProfileSupplier['replay'])
    expect(judgeReplayDeclaration(stored({ foreignThinking: null }), 2)).toEqual(
      invalid('foreign-thinking'),
    )
  })

  it('rejects a replay that is not a plain object, a Map included', () => {
    const stored = (value: unknown) => supplier(value as ProfileSupplier['replay'])
    expect(judgeReplayDeclaration(stored(new Map()), 2)).toEqual(invalid('replay'))
    expect(judgeReplayDeclaration(stored(new (class Declared {})()), 2)).toEqual(invalid('replay'))
  })

  it('does not read produces or accepts from the prototype chain', () => {
    const stored = (value: unknown) => supplier(value as ProfileSupplier['replay'])
    expect(judgeReplayDeclaration(stored(Object.create({ produces: 'p' })), 2)).toEqual(
      invalid('replay'),
    )
    expect(judgeReplayDeclaration(stored(Object.create({ accepts: ['p'] })), 2)).toEqual(
      invalid('replay'),
    )
  })

  it('admits a replay without a prototype', () => {
    const bare = Object.assign(Object.create(null) as object, { produces: 'p' })
    expect(judgeReplayDeclaration(supplier(bare as ProfileSupplier['replay']), 2)).toMatchObject({
      ok: { produces: 'p', accepts: ['p'] },
    })
  })

  it('rejects an accessor of produces as replay and never calls it', () => {
    let calls = 0
    const hostile = {}
    Object.defineProperty(hostile, 'produces', {
      enumerable: true,
      get() {
        calls += 1
        return 'p'
      },
    })
    const stored = supplier(hostile as ProfileSupplier['replay'])
    expect(judgeReplayDeclaration(stored, 2)).toEqual(invalid('replay'))
    expect(calls).toBe(0)
  })

  it('rejects a key that is not enumerable or is a symbol, and an item of accepts that is an accessor', () => {
    const hidden = {}
    Object.defineProperty(hidden, 'produces', { value: 'p', enumerable: false })
    const symbolic = { produces: 'p', [Symbol('x')]: 1 }
    expect(judgeReplayDeclaration(supplier(hidden as ProfileSupplier['replay']), 2)).toEqual(
      invalid('replay'),
    )
    expect(judgeReplayDeclaration(supplier(symbolic as ProfileSupplier['replay']), 2)).toEqual(
      invalid('replay'),
    )
    let calls = 0
    const accepts = ['p']
    Object.defineProperty(accepts, 1, {
      enumerable: true,
      get() {
        calls += 1
        return 'q'
      },
    })
    expect(judgeReplayDeclaration(supplier({ produces: 'p', accepts }), 2)).toEqual(
      invalid('accepts'),
    )
    expect(calls).toBe(0)
  })

  it('rejects, without throwing, a replay that reports a key it gives no descriptor for', () => {
    const hollow = new Proxy(
      {},
      { ownKeys: () => ['produces'], getOwnPropertyDescriptor: () => undefined },
    )
    expect(judgeReplayDeclaration(supplier(hollow as ProfileSupplier['replay']), 2)).toEqual(
      invalid('replay'),
    )
  })

  it('rejects a replay that is a string, a number or an array', () => {
    const stored = (value: unknown) => supplier(value as ProfileSupplier['replay'])
    for (const value of ['p', 1, ['p']]) {
      expect(judgeReplayDeclaration(stored(value), 2)).toEqual(invalid('replay'))
    }
  })

  it('reads a key whose value is undefined as not declared', () => {
    const stored = (value: unknown) => supplier(value as ProfileSupplier['replay'])
    const undeclared = { produces: undefined, accepts: undefined, foreignThinking: undefined }
    expect(judgeReplayDeclaration(stored(undeclared), 2)).toEqual(
      judgeReplayDeclaration(supplier(), 2),
    )
    expect(judgeReplayDeclaration(stored({ produces: 'p', accepts: undefined }), 2)).toMatchObject({
      ok: { produces: 'p', accepts: ['p'] },
    })
  })

  it('reads replay of the supplier once', () => {
    let calls = 0
    const counting = {
      recipient: 'vendor',
      model: 'model-1',
      get replay() {
        calls += 1
        return { produces: 'p' }
      },
    }
    expect(judgeReplayDeclaration(counting, 0)).toMatchObject({ ok: { produces: 'p' } })
    expect(calls).toBe(1)
  })

  it('names the supplier by its position in the field', () => {
    expect(judgeReplayDeclaration(supplier({ produces: '' }), 0)).toEqual(invalid('produces', 0))
  })
})
