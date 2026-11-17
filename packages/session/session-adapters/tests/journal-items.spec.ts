import { describe, expect, it } from 'vitest'
import { canonical } from '../src/testing/canonical.ts'
import {
  emptySessionView,
  foldItems,
  viewItems,
  type PublishedBatch,
  type SessionJournalView,
} from '../src/journal/index.ts'
import { scene } from './fixtures/journal-facts.ts'
import { forAll } from './fixtures/property.ts'

type Held = { open: boolean; body: string }

// Replays the item changes of every fold into a store that keeps the rules of `er_item`: an item opens
// once, and only an open item changes. Answers the first broken rule, or the store.
function replay(
  log: readonly PublishedBatch[],
): Readonly<{ view: SessionJournalView; store: Map<string, Held> }> | string {
  const store = new Map<string, Held>()
  let view = emptySessionView()
  for (const batch of log) {
    const folded = foldItems(view, batch)
    for (const change of folded.changes) {
      const key = JSON.stringify([batch.execution, change.family, change.item])
      const held = store.get(key)
      if (change.change === 'opened' && held !== undefined)
        return `batch ${String(batch.pub)} opens ${key}, which the store holds`
      if (change.change === 'changed' && held?.open !== true)
        return `batch ${String(batch.pub)} changes ${key}, which the store holds ${held === undefined ? 'nowhere' : 'closed'}`
      store.set(key, { open: change.open, body: canonical(change.body) })
    }
    view = folded.view
  }
  return { view, store }
}

describe('the items of the journal view', () => {
  it('the item changes of every fold, replayed into the store, leave exactly the items of the folded view', () => {
    forAll('items', {
      runs: 60,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const replayed = replay(log)
        if (typeof replayed === 'string') return replayed
        const expected = new Map<string, Held>()
        for (const execution of replayed.view.executions.values())
          for (const item of viewItems(execution))
            expected.set(JSON.stringify([execution.execution, item.family, item.item]), {
              open: item.open,
              body: canonical(item.body),
            })
        for (const [key, held] of expected) {
          const stored = replayed.store.get(key)
          if (stored === undefined) return `the store misses ${key}`
          if (stored.body !== held.body) return `the store holds another value for ${key}`
          if (stored.open !== held.open)
            return `the store holds ${key} ${stored.open ? 'open' : 'closed'}`
        }
        for (const key of replayed.store.keys())
          if (!expected.has(key)) return `the store holds ${key}, which the view does not`
        return null
      },
    })
  })

  it('a fold that changes nothing in an execution reports no item', () => {
    const view = emptySessionView()
    const replayed = foldItems(view, {
      execution: 'exe_none',
      envelope: { op: 'op', digest: 'd', rev: 0, gen: 'g', kinds: [] },
      facts: [],
      pub: 0,
    } as unknown as PublishedBatch)
    expect(replayed.changes).toEqual([])
  })
})
