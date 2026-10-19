import { describe, expect, it } from 'vitest'
import { judgeJsonValue } from '@omne-harness/json-text'
import { succeed } from '@omne-harness/operation-result'
import { fixJsonTree, JSON_TREE_MAX_NODES } from '../src/json-tree.ts'
import { answer, ask, askContract, manualWaiter, scope, settled } from './scope-values.ts'

// The request tree of a wait is judged by `judgeJsonValue` of json-text, and this scope adds the
// canonical text and its byte budget. The tests reach both through `context.wait`.
async function refusal(request: unknown, maxBytes = 1_024): Promise<unknown> {
  const waiter = manualWaiter()
  const { scope: s } = scope({ waits: waiter.waits })
  const outcome = await s.context.wait({
    ...ask('confirm', 'x', askContract(maxBytes)),
    request,
  } as never)
  expect(waiter.requests).toEqual([])
  return 'failure' in outcome ? outcome.failure : undefined
}

/** A list of `length` empty slots: a hole is no own property. */
function holes(length: number): unknown[] {
  const list: unknown[] = []
  list.length = length
  return list
}

const nil = { kind: 'null' }
const entry = (key: string, value: unknown) => ({ key, value })
const object = (...entries: unknown[]) => ({ kind: 'object', entries })
const array = (...items: unknown[]) => ({ kind: 'array', items })

describe('5 wait: the request tree is judged by json-text', () => {
  it.each([
    ['an unknown node kind', { kind: 'date', value: 'x' }, 'invalid: value at kind'],
    ['a root that is no node', 'text', 'invalid: type at the root'],
    [
      'an unknown field of a deep node',
      object(entry('a', array({ kind: 'null', extra: 1 }))),
      'invalid: unknown-field at entries[0].value.items[0].extra',
    ],
    [
      'a number lexeme outside the JSON grammar',
      array(nil, { kind: 'number', lexeme: '0x10' }),
      'invalid: type at items[1].lexeme',
    ],
    [
      'a repeated key, at the second key',
      object(entry('q', nil), entry('q', nil)),
      'invalid: duplicate at entries[1].key',
    ],
    ['a hole in a list', { kind: 'array', items: holes(1) }, 'invalid: missing at items[0]'],
  ])('rejects %s with the path in the detail', async (_, request, detail) => {
    expect(await refusal(request)).toEqual({ kind: 'invalid', reason: `request: ${detail}` })
  })

  it('rejects a cycle as a cycle, below the node budget', async () => {
    const cyclic: { kind: 'array'; items: unknown[] } = { kind: 'array', items: [] }
    cyclic.items.push(cyclic)
    expect(await refusal(cyclic)).toEqual({
      kind: 'invalid',
      reason: 'request: cycle: a container is inside itself',
    })
  })

  it('rejects an accessor without calling it', async () => {
    let reads = 0
    const node = { kind: 'string' }
    Object.defineProperty(node, 'value', {
      enumerable: true,
      get() {
        reads += 1
        return 'x'
      },
    })
    expect(await refusal(object(entry('a', node)))).toEqual({
      kind: 'invalid',
      reason: 'request: invalid: accessor at entries[0].value.value',
    })
    expect(reads).toBe(0)
  })

  it('rejects a tree whose reading throws as invalid, and the wait does not throw', async () => {
    const hostile = new Proxy(
      { kind: 'null' },
      {
        ownKeys: () => {
          throw new Error('trap')
        },
      },
    )
    expect(await refusal(array(hostile))).toEqual({
      kind: 'invalid',
      reason: 'request: invalid: unreadable at the root',
    })
  })

  it('writes the canonical text and counts its bytes: exactly maxBytes fits, one less is too large', async () => {
    const tree = object(
      entry('é', array({ kind: 'number', lexeme: '1000' }, { kind: 'boolean', value: true }, nil)),
      entry('s', { kind: 'string', value: 'a"\n€' }),
      entry('empty', object()),
    )
    const text = JSON.stringify({ é: [1000, true, null], s: 'a"\n€', empty: {} })
    const bytes = Buffer.byteLength(text)
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    const fits = s.context.wait({ ...ask('fits', 'x', askContract(bytes)), request: tree } as never)
    await settled()
    expect(waiter.requests).toHaveLength(1)
    waiter.answers[0]?.resolve(succeed(answer))
    expect(await fits).toEqual({ ok: answer })
    expect(await refusal(tree, bytes - 1)).toEqual({
      kind: 'invalid',
      reason: `request: too-large: more than ${bytes - 1} bytes`,
    })
  })

  it('forwards a frozen copy of the request tree that shares no node with the caller', async () => {
    const leaf = { kind: 'string', value: 'v' }
    const tree = object(entry('a', leaf))
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    const pending = s.context.wait({ ...ask('copy'), request: tree } as never)
    await settled()
    const forwarded = waiter.requests[0]?.request
    expect(forwarded).toEqual(tree)
    expect(forwarded).not.toBe(tree)
    expect(Object.isFrozen(forwarded)).toBe(true)
    leaf.value = 'changed'
    expect(forwarded).toEqual(object(entry('a', { kind: 'string', value: 'v' })))
    waiter.answers[0]?.resolve(succeed(answer))
    await pending
  })

  // Slow: json-text must read a million nodes before the budget fires (about one second of CPU).
  it(
    'rejects a request that reaches more than a million nodes as budget, not as invalid',
    { tags: ['slow'] },
    async () => {
      // One list of 1001 nulls shared by 1001 parents: 1,003,003 visits when each visit counts.
      const row = array(...Array.from({ length: 1_001 }, () => nil))
      const shared = array(...Array.from({ length: 1_001 }, () => row))
      expect(await refusal(shared, 100_000_000)).toEqual({
        kind: 'invalid',
        reason: 'request: budget: more than 1000000 nodes',
      })
    },
  )
})

// The byte budget bounds the check. fixJsonTree runs the check with at most maxBytes visits, which
// is sound only if an accepted tree never has more visits than its canonical text has bytes.

/** Deterministic pseudo-random numbers, so that a failing tree can be rebuilt from its seed. */
function randoms(seed: number): (below: number) => number {
  let state = seed >>> 0
  return below => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32) * below)
  }
}

type Built = Readonly<{ tree: unknown; text: string; visits: number }>

const WORDS = ['', 'a', 'é', '€', '😀', 'a"b\\c\n', 'key', '\u0000']
const LEXEMES = ['0', '-0', '7', '1000', '-1.5', '1e9', '2E-3', '0.000']

/**
 * A random tree with its canonical text and its visit count written by this test alone: nested
 * objects and arrays, empty containers, empty and multi-byte strings and keys, and containers
 * that several parents share (every reached visit counts).
 */
function build(random: (below: number) => number, depth: number, pool: Built[]): Built {
  const shared = pool.length > 0 && random(4) === 0
  if (shared) return pool[random(pool.length)] as Built
  const kind = depth === 0 ? random(4) : random(7)
  let built: Built
  if (kind === 0) built = { tree: { kind: 'null' }, text: 'null', visits: 1 }
  else if (kind === 1) {
    const value = random(2) === 0
    built = { tree: { kind: 'boolean', value }, text: String(value), visits: 1 }
  } else if (kind === 2) {
    const value = WORDS[random(WORDS.length)] as string
    built = { tree: { kind: 'string', value }, text: JSON.stringify(value), visits: 1 }
  } else if (kind === 3) {
    const lexeme = LEXEMES[random(LEXEMES.length)] as string
    built = { tree: { kind: 'number', lexeme }, text: lexeme, visits: 1 }
  } else if (kind <= 5) {
    const items = Array.from({ length: random(7) }, () => build(random, depth - 1, pool))
    built = {
      tree: { kind: 'array', items: items.map(item => item.tree) },
      text: `[${items.map(item => item.text).join(',')}]`,
      visits: 1 + items.reduce((sum, item) => sum + item.visits, 0),
    }
  } else {
    const entries = Array.from({ length: random(7) }, (_, index) => ({
      key: `${WORDS[random(WORDS.length)]}${index}`,
      child: build(random, depth - 1, pool),
    }))
    built = {
      tree: {
        kind: 'object',
        entries: entries.map(({ key, child }) => ({ key, value: child.tree })),
      },
      text: `{${entries.map(({ key, child }) => `${JSON.stringify(key)}:${child.text}`).join(',')}}`,
      visits: 1 + entries.reduce((sum, { child }) => sum + child.visits, 0),
    }
  }
  pool.push(built)
  return built
}

/** Whether a container object is reached through two parents. */
function sharesNode(tree: unknown): boolean {
  const seen = new Set<object>()
  const pending = [tree]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const node = next as { items?: unknown[]; entries?: { value: unknown }[] }
    const children = node.items ?? node.entries?.map(entry => entry.value) ?? []
    if (children.length === 0) continue
    if (seen.has(node)) return true
    seen.add(node)
    pending.push(...children)
  }
  return false
}

describe('5 wait: the byte budget bounds the check', () => {
  it('visits at most as many nodes as the canonical text has bytes, for 400 varied trees', () => {
    let largest = 0
    let sharing = 0
    for (let seed = 1; seed <= 400; seed += 1) {
      const { tree, text, visits } = build(randoms(seed), 6, [])
      const bytes = Buffer.byteLength(text)
      // The model of the visit count is the test's own: it matches what json-text counts.
      expect(judgeJsonValue(tree, { maxVisits: visits }), `seed ${seed}`).toHaveProperty('ok')
      if (visits > 1) {
        expect(judgeJsonValue(tree, { maxVisits: visits - 1 }), `seed ${seed}`).toMatchObject({
          rejected: 'budget',
        })
      }
      // The premise: the visits of an accepted tree never exceed the bytes of its text.
      expect(visits, `seed ${seed}`).toBeLessThanOrEqual(bytes)
      expect(judgeJsonValue(tree, { maxVisits: bytes }), `seed ${seed}`).toHaveProperty('ok')
      // The text Tool writes is the model's text, and the size is its byte count.
      const fixed = fixJsonTree(tree, bytes)
      expect(fixed, `seed ${seed}`).toHaveProperty('ok')
      expect('ok' in fixed ? [fixed.ok.text, fixed.ok.bytes] : []).toEqual([text, bytes])
      // One byte less is too large, never budget.
      if (bytes > 1) {
        expect(fixJsonTree(tree, bytes - 1), `seed ${seed}`).toEqual({
          failure: { reason: 'too-large', detail: `more than ${bytes - 1} bytes` },
        })
      }
      largest = Math.max(largest, visits)
      if (sharesNode(tree)) sharing += 1
    }
    // The generator reaches trees of some size, not only leaves.
    expect(largest).toBeGreaterThan(50)
    expect(sharing).toBeGreaterThan(20)
  })

  it('fits a one-node tree of one byte in one visit', () => {
    const fixed = fixJsonTree({ kind: 'number', lexeme: '0' }, 1)
    expect(fixed).toMatchObject({ ok: { text: '0', bytes: 1 } })
  })

  it('rejects a tree with far more nodes than maxBytes as too-large, after about maxBytes visits', () => {
    let visits = 0
    // Reading the kind of a node is one visit of it: a Proxy counts the reads of that field.
    const counted = new Proxy(
      { kind: 'null' },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === 'kind') visits += 1
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
      },
    )
    // 1001 shared lists of 1001 counted nodes: over a million visits if the walk were not bounded.
    const row = array(...Array.from({ length: 1_001 }, () => counted))
    const shared = array(...Array.from({ length: 1_001 }, () => row))
    expect(fixJsonTree(shared, 500)).toEqual({
      failure: { reason: 'too-large', detail: 'more than 500 bytes' },
    })
    // The first list is longer than the budget, so the walk stops before it reads any node.
    expect(visits).toBeLessThanOrEqual(500)
    visits = 0
    // With a budget that holds one row but not the tree, the walk stops after that budget.
    expect(fixJsonTree(shared, 3_000)).toEqual({
      failure: { reason: 'too-large', detail: 'more than 3000 bytes' },
    })
    expect(visits).toBeGreaterThan(0)
    expect(visits).toBeLessThanOrEqual(3_000)
  })

  // The list of 21 slots is longer than the budget of 10 visits, so the walk stops at that list and
  // never reads the invalid slot: the answer is too-large, not invalid.
  it('stops at the budget before it reaches an invalid part that comes later', () => {
    const later = array(...Array.from({ length: 20 }, () => nil), { kind: 'bogus' })
    expect(fixJsonTree(later, 10)).toEqual({
      failure: { reason: 'too-large', detail: 'more than 10 bytes' },
    })
    expect(fixJsonTree(later, 1_000)).toEqual({
      failure: { reason: 'invalid', detail: 'value at items[20].kind' },
    })
  })

  it('still classifies a small invalid tree as invalid under a budget below, at and above the node limit', () => {
    const invalid = array(nil, { kind: 'number', lexeme: '0x10' })
    for (const maxBytes of [1_024, JSON_TREE_MAX_NODES, 100_000_000]) {
      expect(fixJsonTree(invalid, maxBytes)).toEqual({
        failure: { reason: 'invalid', detail: 'type at items[1].lexeme' },
      })
    }
  })
})
