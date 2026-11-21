import { describe, expect, it } from 'vitest'
import { fetchClosed } from '../src/cordis/item-read.ts'
import { SharedMap } from '../src/journal/shared-map.ts'
import { emptySessionView, type PublishedBatch } from '../src/journal/index.ts'
import {
  itemText,
  landClosed,
  landOnce,
  underText,
  type ClosedTable,
  type ItemRef,
} from '../src/testing/closed-items.ts'
import { custodyChain } from '../src/testing/journal-handoff-checks.ts'
import { evidence } from './fixtures/journal-facts.ts'

// The three places that decide what a core may land, read back and chain, with no journal behind.

const EXECUTION = 'exe_landing' as never

const fence = (pub: number, operation: string): PublishedBatch => ({
  execution: EXECUTION,
  envelope: {
    op: `op-${String(pub)}` as never,
    digest: `d-${String(pub)}`,
    rev: 0,
    gen: '1',
    kinds: [],
  },
  facts: [
    {
      kind: 'fence.started',
      operation: operation as never,
      guard: { owner: 'agent', resource: 'attachment', revision: '1', evidence: evidence('g') },
      fence: evidence(`fence-${operation}`),
    },
  ],
  pub,
})

const tableOf = (closedComplete: boolean): ClosedTable => ({
  closed: new SharedMap(),
  closedComplete,
})
const fenceText = (operation: string) =>
  itemText({ execution: EXECUTION, family: 'fence', item: operation })

describe('landing a batch', () => {
  it('a table that is the whole store lands an item once and refuses the batch that opens it again', () => {
    const table = tableOf(true)
    const first = landOnce(table, emptySessionView(), fence(1, 'top_a'))
    expect(first).not.toBeNull()
    expect(table.closed.has(fenceText('top_a'))).toBe(true)
    const kept = table.closed.get(fenceText('top_a'))
    expect(landOnce(table, first!, fence(2, 'top_a'))).toBeNull()
    // The refused batch wrote nothing: the first fence stands as it was.
    expect(table.closed.get(fenceText('top_a'))).toBe(kept)
    expect(landOnce(table, first!, fence(2, 'top_b'))).not.toBeNull()
    expect(table.closed.has(fenceText('top_b'))).toBe(true)
  })

  it('a table that is a part of the store leaves the rule to the store', () => {
    const table = tableOf(false)
    const first = landOnce(table, emptySessionView(), fence(1, 'top_a'))
    expect(landOnce(table, first!, fence(2, 'top_a'))).not.toBeNull()
  })

  it('a batch folded again from the view before it lands as it did the first time', () => {
    const table = tableOf(true)
    const before = emptySessionView()
    landOnce(table, before, fence(1, 'top_a'))
    const again = landClosed(table, before, fence(1, 'top_a'))
    expect(again.executions.get(EXECUTION)?.entries).toBe(1)
  })
})

describe('reading closed items back in the rounds of one call', () => {
  const ref = (item: string, under?: true): ItemRef =>
    ({ execution: EXECUTION, family: 'answer', item, ...(under ? { under } : {}) }) as ItemRef
  const lenderOf = (fetched: Map<string, unknown>) => ({
    tenantText: 'tenant',
    session: 'session',
    fetched,
    lentBlocks: new Map<string, string>(),
  })
  const never = () => Promise.reject(new Error('the store must not be read'))

  it('a round that asks only for what the call has read is answered without a read', async () => {
    const fetched = new Map<string, unknown>([
      [itemText(ref('a')), null],
      [underText(ref('b/', true)), []],
    ])
    expect(await fetchClosed(never, lenderOf(fetched), [ref('a'), ref('b/', true)])).toBe(
      'a round needs closed items the call has already read',
    )
  })

  it('a round asks the store for the items it has not read, and only for those', async () => {
    const fetched = new Map<string, unknown>([[itemText(ref('a')), null]])
    const asked: unknown[] = []
    const read = async (_handler: string, input: unknown) => {
      asked.push(input)
      return { kind: 'unread' as const, reason: 'scripted' }
    }
    const answer = await fetchClosed(read as never, lenderOf(fetched), [ref('a'), ref('c')])
    expect(answer).toContain('scripted')
    expect(asked).toEqual([expect.objectContaining({ keys: [{ family: 'answer', item: 'c' }] })])
  })
})

describe('the custody chain of a hand-off', () => {
  const attempt = (predecessor: string | null) =>
    ({
      handoff: {},
      original: {},
      custody: predecessor === null ? null : { predecessor: { operation: predecessor } },
    }) as never
  const states =
    (table: Record<string, 'committed' | 'excluded'>) =>
    (operation: string): 'committed' | 'excluded' | undefined =>
      table[operation]

  it('has no chain without a root attempt', () => {
    expect(custodyChain([['rh-2' as never, attempt('rh-1')]], states({}) as never)).toBeNull()
  })

  it('stops at an attempt whose outcome is not known', () => {
    expect(custodyChain([['rh-1' as never, attempt(null)]], states({}) as never)).toEqual({
      root: 'rh-1',
      chain: [],
      committed: null,
    })
  })

  it('follows each excluded attempt to its successor and names the one that committed', () => {
    const attempts = [
      ['rh-3' as never, attempt('rh-2')],
      ['rh-1' as never, attempt(null)],
      ['rh-2' as never, attempt('rh-1')],
    ] as never
    const table = { 'rh-1': 'excluded', 'rh-2': 'excluded', 'rh-3': 'committed' } as const
    expect(custodyChain(attempts, states(table) as never)).toEqual({
      root: 'rh-1',
      chain: [
        { operation: 'rh-1', predecessor: null, state: 'excluded' },
        { operation: 'rh-2', predecessor: 'rh-1', state: 'excluded' },
        { operation: 'rh-3', predecessor: 'rh-2', state: 'committed' },
      ],
      committed: 'rh-3',
    })
  })

  it('a root that committed is the whole chain', () => {
    expect(
      custodyChain([['rh-1' as never, attempt(null)]], states({ 'rh-1': 'committed' }) as never),
    ).toEqual({
      root: 'rh-1',
      chain: [{ operation: 'rh-1', predecessor: null, state: 'committed' }],
      committed: 'rh-1',
    })
  })
})
