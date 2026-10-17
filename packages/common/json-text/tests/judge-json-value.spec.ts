import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  judgeJsonValue,
  readJsonText,
  type JsonLimits,
  type JsonTreePath,
  type JsonValue,
  type JsonValueJudgment,
} from '@omne-harness/json-text'

const roomy: JsonLimits = {
  maxBytes: 1_000_000,
  maxDepth: 200_000,
  maxItems: 1_000_000,
  maxMembers: 100,
  maxStringLength: 1_000,
  maxNumberLength: 100,
}

const nil = { kind: 'null' }
const str = (value: unknown): unknown => ({ kind: 'string', value })
const num = (lexeme: unknown): unknown => ({ kind: 'number', lexeme })
const arr = (...items: unknown[]): { kind: 'array'; items: unknown[] } => ({
  kind: 'array',
  items,
})
const obj = (...entries: [unknown, unknown][]): { kind: 'object'; entries: unknown[] } => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

/** An object of `count` members, built without spreading the members as arguments. */
function manyMembers(count: number): { kind: 'object'; entries: unknown[] } {
  return {
    kind: 'object',
    entries: Array.from({ length: count }, (_, index) => ({ key: `k${index}`, value: nil })),
  }
}

function rejection(judgment: JsonValueJudgment): Extract<JsonValueJudgment, { rejected: string }> {
  if ('ok' in judgment) throw new Error('expected a rejection')
  return judgment
}

function accepted(judgment: JsonValueJudgment): JsonValue {
  if ('rejected' in judgment) throw new Error(`rejected ${judgment.rejected} at ${judgment.path}`)
  return judgment.ok
}

function readTree(text: string): JsonValue {
  const read = readJsonText(text, roomy)
  if (read.kind !== 'ok') throw new Error(`reader failed: ${read.kind}`)
  return read.value
}

describe('judgeJsonValue accepts', () => {
  it('every kind of node as a copy that equals the input', () => {
    const tree = obj(
      ['a', nil],
      ['b', { kind: 'boolean', value: true }],
      ['c', str('x')],
      ['d', num('-0.5e+3')],
      ['e', arr(nil, arr())],
      ['f', obj()],
    )
    expect(accepted(judgeJsonValue(tree))).toEqual(tree)
  })

  it.each([
    'null',
    'true',
    '"plain"',
    '"\\uD800"',
    '"\\uDC00\\uD800"',
    '{"\\uD800":1,"\\uDC00":2}',
    '[1,1.0,-0,1E5,1e-5,0.1,123456789012345678901234567890]',
    '{"__proto__":{"constructor":[]},"b":[{"c":null}]}',
    '{"2":1,"1":2}',
    '[[[[[[[[[[]]]]]]]]]]',
    ' { "a" : [ 1 , 2 ] } ',
  ])('every value that readJsonText produces: %s', text => {
    const tree = readTree(text)
    expect(accepted(judgeJsonValue(tree))).toEqual(tree)
  })

  it('a container shared by two parents, copied once for each parent', () => {
    const shared = arr(nil)
    const copy = accepted(judgeJsonValue(arr(shared, shared)))
    if (copy.kind !== 'array') throw new Error('expected an array')
    const [first, second] = copy.items
    expect(first).toEqual(shared)
    expect(second).toEqual(shared)
    expect(first).not.toBe(second)
  })

  it('a tree 100,000 levels deep without a RangeError', () => {
    let nested: unknown = nil
    for (let level = 0; level < 100_000; level += 1) nested = arr(nested)
    let wrapped: unknown = nil
    for (let level = 0; level < 100_000; level += 1) wrapped = obj(['k', wrapped])
    expect('ok' in judgeJsonValue(nested)).toBe(true)
    expect('ok' in judgeJsonValue(wrapped)).toBe(true)
  })

  // A spread of the members as call arguments overflows the stack from about 130,000 members.
  it('an object of 200,000 members, as a copy that equals it', () => {
    const wide = manyMembers(200_000)
    expect(accepted(judgeJsonValue(wide))).toEqual(wide)
  })

  it('a deep tree that readJsonText produced', () => {
    const depth = 100_000
    const text = `${'['.repeat(depth)}${']'.repeat(depth)}`
    const tree = readTree(text)
    expect('ok' in judgeJsonValue(tree)).toBe(true)
  })
})

describe('judgeJsonValue returns a frozen copy that shares nothing with the input', () => {
  function everyNode(tree: JsonValue): object[] {
    const nodes: object[] = []
    const pending: unknown[] = [tree]
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (typeof next !== 'object' || next === null) continue
      nodes.push(next)
      pending.push(...Object.values(next))
    }
    return nodes
  }

  it('freezes every node, list and entry', () => {
    const copy = accepted(
      judgeJsonValue(obj(['a', arr(str('x'), num('1'))], ['b', obj(['c', nil])])),
    )
    const nodes = everyNode(copy)
    expect(nodes.length).toBeGreaterThan(8)
    expect(nodes.every(node => Object.isFrozen(node))).toBe(true)
  })

  it('does not follow a later change of the input', () => {
    const input = obj(['a', arr(str('x'))])
    const before = structuredClone(input)
    const copy = accepted(judgeJsonValue(input))
    const inputNodes = new Set(everyNode(input as unknown as JsonValue))
    expect(everyNode(copy).some(node => inputNodes.has(node))).toBe(false)
    input.entries.push({ key: 'late', value: nil })
    expect(copy).toEqual(before)
  })
})

describe('judgeJsonValue rejects, and names the field', () => {
  const cases: readonly (readonly [string, unknown, string, JsonTreePath])[] = [
    ['a missing kind', {}, 'missing', ['kind']],
    ['a missing string value', { kind: 'string' }, 'missing', ['value']],
    ['a missing boolean value', { kind: 'boolean' }, 'missing', ['value']],
    [
      'a lexeme that is undefined in a list',
      arr(nil, num(undefined)),
      'type',
      ['items', 1, 'lexeme'],
    ],
    ['a missing lexeme', arr({ kind: 'number' }), 'missing', ['items', 0, 'lexeme']],
    ['missing items', { kind: 'array' }, 'missing', ['items']],
    ['missing entries', arr(nil, { kind: 'object' }), 'missing', ['items', 1, 'entries']],
    [
      'a hole in items',
      { kind: 'array', items: Object.assign([], { 0: nil, 2: nil }) },
      'missing',
      ['items', 1],
    ],
    [
      'a missing entry value',
      { kind: 'object', entries: [{ key: 'a' }] },
      'missing',
      ['entries', 0, 'value'],
    ],
    [
      'a missing entry key',
      { kind: 'object', entries: [{ value: nil }] },
      'missing',
      ['entries', 0, 'key'],
    ],
    ['an unknown kind', { kind: 'bogus' }, 'value', ['kind']],
    ['a kind that is not a string', { kind: 5 }, 'value', ['kind']],
    ['a kind that names a prototype member', { kind: 'toString' }, 'value', ['kind']],
    [
      'an unknown kind below an entry',
      obj(['a', arr({ kind: 'Null' })]),
      'value',
      ['entries', 0, 'value', 'items', 0, 'kind'],
    ],
    ['null at the root', null, 'type', []],
    ['a number at the root', 3, 'type', []],
    ['a string at the root', 'text', 'type', []],
    ['a bare array at the root', [], 'type', []],
    ['a Map', new Map(), 'type', []],
    ['a Date inside a list', arr(new Date(0)), 'type', ['items', 0]],
    ['a class instance', new (class Node {})(), 'type', []],
    ['a string value that is not a string', str(5), 'type', ['value']],
    [
      'a boolean value that is not a boolean',
      { kind: 'boolean', value: 'true' },
      'type',
      ['value'],
    ],
    ['items that are not a list', { kind: 'array', items: {} }, 'type', ['items']],
    ['entries that are not a list', { kind: 'object', entries: 'x' }, 'type', ['entries']],
    ['an entry that is not an object', { kind: 'object', entries: [5] }, 'type', ['entries', 0]],
    ['a non-string key', obj([1, nil]), 'type', ['entries', 0, 'key']],
    ['a lexeme that is not a string', num(1), 'type', ['lexeme']],
    ...['01', '1.', '.5', '+1', '0x10', 'NaN', 'Infinity', '1e', '- 1', '', ' 1', '1 '].map(
      lexeme => [`the lexeme ${JSON.stringify(lexeme)}`, num(lexeme), 'type', ['lexeme']] as const,
    ),
    ['an extra field on null', { kind: 'null', extra: 1 }, 'unknown-field', ['extra']],
    ['an extra field on a leaf', { kind: 'string', value: 'x', raw: 1 }, 'unknown-field', ['raw']],
    [
      'an extra field on an entry',
      { kind: 'object', entries: [{ key: 'a', value: nil, more: 1 }] },
      'unknown-field',
      ['entries', 0, 'more'],
    ],
    [
      'an extra field below a list',
      arr(nil, { kind: 'array', items: [], size: 0 }),
      'unknown-field',
      ['items', 1, 'size'],
    ],
    ['a symbol key', { kind: 'null', [Symbol('tag')]: 1 }, 'unknown-field', ['Symbol(tag)']],
    [
      'the second of two equal keys',
      obj(['a', nil], ['a', nil]),
      'duplicate',
      ['entries', 1, 'key'],
    ],
    [
      'the repeat of the first key after others',
      obj(['a', nil], ['b', nil], ['a', str('again')]),
      'duplicate',
      ['entries', 2, 'key'],
    ],
    [
      'a repeated key in a nested object',
      arr(obj(['x', obj(['k', nil], ['k', nil])])),
      'duplicate',
      ['items', 0, 'entries', 0, 'value', 'entries', 1, 'key'],
    ],
  ]

  it.each(cases)('%s', (_, value, rejected, path) => {
    expect(judgeJsonValue(value)).toEqual({ rejected, path })
  })

  it('a list that holds itself, at the field that points back', () => {
    const list = arr()
    list.items.push(list)
    expect(judgeJsonValue(list)).toEqual({ rejected: 'cycle', path: ['items', 0] })
  })

  it('an object that holds an ancestor, at the field that points back', () => {
    const top = obj(['a', nil])
    const middle = arr(nil, top)
    top.entries.push({ key: 'back', value: middle })
    expect(judgeJsonValue(middle)).toEqual({
      rejected: 'cycle',
      path: ['items', 1, 'entries', 1, 'value'],
    })
  })

  it('a tree that holds itself 100,000 levels down', () => {
    const root = arr()
    let tip = root
    for (let level = 0; level < 100_000; level += 1) {
      const next = arr()
      tip.items.push(next)
      tip = next
    }
    tip.items.push(root)
    const judged = rejection(judgeJsonValue(root))
    expect(judged.rejected).toBe('cycle')
    expect(judged.path).toHaveLength(2 * 100_001)
  })

  it('a node that is not a plain object because its prototype is not Object.prototype', () => {
    const node = Object.create({ inherited: true }) as Record<string, unknown>
    node['kind'] = 'null'
    expect(judgeJsonValue(node)).toEqual({ rejected: 'type', path: [] })
  })

  it('a node with a null prototype is accepted', () => {
    const node = Object.assign(Object.create(null) as object, { kind: 'null' })
    expect('ok' in judgeJsonValue(node)).toBe(true)
  })
})

describe('judgeJsonValue never calls a getter', () => {
  function withGetter(target: object, key: string, calls: string[]): void {
    Object.defineProperty(target, key, {
      enumerable: true,
      get() {
        calls.push(key)
        return 'x'
      },
    })
  }

  it('rejects an accessor on kind, on a value and on a lexeme', () => {
    const calls: string[] = []
    const onKind = {}
    withGetter(onKind, 'kind', calls)
    const onValue = { kind: 'string' }
    withGetter(onValue, 'value', calls)
    const onLexeme = { kind: 'number' }
    withGetter(onLexeme, 'lexeme', calls)
    expect(judgeJsonValue(onKind)).toEqual({ rejected: 'accessor', path: ['kind'] })
    expect(judgeJsonValue(arr(onValue))).toEqual({
      rejected: 'accessor',
      path: ['items', 0, 'value'],
    })
    expect(judgeJsonValue(onLexeme)).toEqual({ rejected: 'accessor', path: ['lexeme'] })
    expect(calls).toEqual([])
  })

  it('rejects an accessor on items, entries, an entry key, an entry value and a list slot', () => {
    const calls: string[] = []
    const onItems = { kind: 'array' }
    withGetter(onItems, 'items', calls)
    const onEntries = { kind: 'object' }
    withGetter(onEntries, 'entries', calls)
    const entry = { value: nil }
    withGetter(entry, 'key', calls)
    const valueEntry = { key: 'k' }
    withGetter(valueEntry, 'value', calls)
    const slotted: unknown[] = []
    Object.defineProperty(slotted, 0, {
      enumerable: true,
      get() {
        calls.push('0')
        return nil
      },
    })
    expect(judgeJsonValue(onItems)).toEqual({ rejected: 'accessor', path: ['items'] })
    expect(judgeJsonValue(onEntries)).toEqual({ rejected: 'accessor', path: ['entries'] })
    expect(judgeJsonValue({ kind: 'object', entries: [entry] })).toEqual({
      rejected: 'accessor',
      path: ['entries', 0, 'key'],
    })
    expect(judgeJsonValue({ kind: 'object', entries: [valueEntry] })).toEqual({
      rejected: 'accessor',
      path: ['entries', 0, 'value'],
    })
    expect(judgeJsonValue({ kind: 'array', items: slotted })).toEqual({
      rejected: 'accessor',
      path: ['items', 0],
    })
    expect(calls).toEqual([])
  })

  it('does not run a toJSON, a toString or a Symbol.toPrimitive of the input', () => {
    const calls: string[] = []
    const node = {
      kind: 'string',
      value: 'x',
    }
    Object.defineProperty(node, 'toJSON', {
      enumerable: false,
      value: () => calls.push('toJSON'),
    })
    expect(judgeJsonValue(node)).toEqual({ rejected: 'unknown-field', path: ['toJSON'] })
    expect(calls).toEqual([])
  })
})

describe('judgeJsonValue lets no exception out of reading the input', () => {
  const trapped = (trap: keyof ProxyHandler<object>, target: object): object =>
    new Proxy(target, {
      [trap]: () => {
        throw new Error(`${trap} trap`)
      },
    })

  it.each(['getOwnPropertyDescriptor', 'ownKeys', 'getPrototypeOf'] as const)(
    'a Proxy whose %s trap throws is unreadable at the root, even below a good prefix',
    trap => {
      const bad = trapped(trap, { kind: 'null' })
      expect(judgeJsonValue(bad)).toEqual({ rejected: 'unreadable', path: [] })
      expect(judgeJsonValue(arr(nil, arr(bad)))).toEqual({ rejected: 'unreadable', path: [] })
    },
  )

  it('a Proxy list whose length read throws is unreadable', () => {
    const list = new Proxy([nil], {
      get() {
        throw new Error('get trap')
      },
    })
    expect(judgeJsonValue({ kind: 'array', items: list })).toEqual({
      rejected: 'unreadable',
      path: [],
    })
  })

  describe('an exception that the walk raises itself', () => {
    afterEach(() => vi.restoreAllMocks())

    it('is not reported as unreadable', () => {
      vi.spyOn(Object, 'freeze').mockImplementation(() => {
        throw new RangeError('raised by the walk')
      })
      expect(() => judgeJsonValue(nil)).toThrow(RangeError)
    })
  })

  it('a revoked Proxy is unreadable', () => {
    const { proxy, revoke } = Proxy.revocable({ kind: 'null' }, {})
    revoke()
    expect(judgeJsonValue(proxy)).toEqual({ rejected: 'unreadable', path: [] })
  })
})

describe('judgeJsonValue visit budget', () => {
  // One child per level, so the node that reaches the limit does not depend on a visiting order.
  const chain = arr(arr(nil))

  it('accepts a tree of exactly maxVisits nodes and rejects at the list that would pass it', () => {
    expect('ok' in judgeJsonValue(chain, { maxVisits: 3 })).toBe(true)
    expect(judgeJsonValue(chain, { maxVisits: 2 })).toEqual({
      rejected: 'budget',
      path: ['items', 0, 'items'],
    })
    expect(judgeJsonValue(chain, { maxVisits: 1 })).toEqual({
      rejected: 'budget',
      path: ['items'],
    })
  })

  it('counts the entries of an object as visits, at the exact boundary', () => {
    const tree = obj(['a', nil], ['b', arr(nil)])
    expect('ok' in judgeJsonValue(tree, { maxVisits: 4 })).toBe(true)
    expect(judgeJsonValue(tree, { maxVisits: 3 })).toEqual({
      rejected: 'budget',
      path: ['entries', 1, 'value', 'items'],
    })
  })

  it('counts the siblings that wait in the queue when it checks a list', () => {
    // The first item is a list of ten leaves and ten leaf siblings wait behind it: 22 visits.
    // The inner list alone fits in 21, so only the waiting siblings make it exceed the budget.
    const waiting = arr(arr(...Array.from({ length: 10 }, () => nil)), ...Array(10).fill(nil))
    expect('ok' in judgeJsonValue(waiting, { maxVisits: 22 })).toBe(true)
    expect(judgeJsonValue(waiting, { maxVisits: 21 })).toEqual({
      rejected: 'budget',
      path: ['items', 0, 'items'],
    })
  })

  it('rejects a list that is longer than maxVisits without reading a slot', () => {
    const slotReads: (string | symbol)[] = []
    const claimed = new Proxy([], {
      get: (target, key) => {
        if (key === 'length') return 10_000_000
        slotReads.push(key)
        return Reflect.get(target, key)
      },
      getOwnPropertyDescriptor: (target, key) => {
        slotReads.push(key)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    const started = performance.now()
    expect(judgeJsonValue({ kind: 'array', items: claimed }, { maxVisits: 1 })).toEqual({
      rejected: 'budget',
      path: ['items'],
    })
    expect(judgeJsonValue({ kind: 'object', entries: claimed }, { maxVisits: 5 })).toEqual({
      rejected: 'budget',
      path: ['entries'],
    })
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(slotReads.filter(key => key !== 'length')).toEqual([])
  })

  it.each([0.5, -1, Number.NaN, '3', Number.MAX_SAFE_INTEGER + 1])(
    'a Proxy list that claims the length %s is unreadable',
    length => {
      const claimed = new Proxy([], {
        get: (target, key) => (key === 'length' ? length : Reflect.get(target, key)),
      })
      expect(judgeJsonValue({ kind: 'array', items: claimed })).toEqual({
        rejected: 'unreadable',
        path: [],
      })
    },
  )

  // Slow: two walks over one million nodes each, which is heavy CPU.
  it('has a default of 1,000,000 visits', { tags: ['slow'] }, () => {
    const wide = (count: number): unknown => ({
      kind: 'array',
      items: Array.from({ length: count - 1 }, () => nil),
    })
    expect('ok' in judgeJsonValue(wide(1_000_000))).toBe(true)
    expect(rejection(judgeJsonValue(wide(1_000_001))).rejected).toBe('budget')
  })

  // Slow: the deepest default-budget object, about one million entries, copied and compared.
  it(
    'accepts an object of 999,999 members under the default budget as a copy that equals it',
    { tags: ['slow'] },
    () => {
      const wide = manyMembers(999_999)
      expect(accepted(judgeJsonValue(wide))).toEqual(wide)
      const wider = manyMembers(1_000_000)
      expect(judgeJsonValue(wider)).toEqual({ rejected: 'budget', path: ['entries'] })
    },
  )

  it('counts a shared subtree each time it is reached', () => {
    let shared: unknown = nil
    for (let level = 0; level < 24; level += 1) shared = arr(shared, shared)
    const judged = rejection(judgeJsonValue(shared))
    expect(judged.rejected).toBe('budget')
  })

  it('counts every node of a shared subtree against maxVisits', () => {
    let shared: unknown = nil
    for (let level = 0; level < 12; level += 1) shared = arr(shared, shared)
    expect('ok' in judgeJsonValue(shared, { maxVisits: 2 ** 13 - 1 })).toBe(true)
    expect(rejection(judgeJsonValue(shared, { maxVisits: 2 ** 13 - 2 })).rejected).toBe('budget')
  })

  it.each([0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '5', null])(
    'maxVisits %s throws TypeError',
    maxVisits => {
      const loose = judgeJsonValue as (value: unknown, limits: unknown) => JsonValueJudgment
      expect(() => loose(nil, { maxVisits })).toThrow(TypeError)
    },
  )

  it('a limits object whose maxVisits cannot be read throws TypeError', () => {
    const loose = judgeJsonValue as (value: unknown, limits: unknown) => JsonValueJudgment
    const getter = {
      get maxVisits(): number {
        throw new Error('getter')
      },
    }
    const trapped = new Proxy(
      {},
      {
        get() {
          throw new Error('get trap')
        },
      },
    )
    const { proxy: revoked, revoke } = Proxy.revocable({}, {})
    revoke()
    for (const limits of [getter, trapped, revoked])
      expect(() => loose(nil, limits)).toThrow(TypeError)
  })

  it.each([null, 5, 'limits', {}])('limits %s throws TypeError', limits => {
    const loose = judgeJsonValue as (value: unknown, limits: unknown) => JsonValueJudgment
    expect(() => loose(nil, limits)).toThrow(TypeError)
  })
})
