import { describe, expect, it } from 'vitest'
import { canonical } from '../src/testing/canonical.ts'
import {
  emptySessionView,
  foldItems,
  refOf,
  viewItems,
  viewOfItems,
  viewText,
  type PublishedBatch,
  type SessionJournalView,
} from '../src/journal/index.ts'
import { evidence, scene } from './fixtures/journal-facts.ts'
import { forAll, random } from './fixtures/property.ts'

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
  it('the item changes of every fold, replayed into the store, leave open exactly the items the view holds', () => {
    forAll('items', {
      runs: 60,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const replayed = replay(log)
        if (typeof replayed === 'string') return replayed
        const held = new Map<string, Held>()
        for (const execution of replayed.view.executions.values())
          for (const item of viewItems(execution)) {
            const key = JSON.stringify([execution.execution, item.family, item.item])
            if (!item.open) return `the view holds ${key}, which its family has closed`
            held.set(key, { open: true, body: canonical(item.body) })
          }
        for (const [key, item] of held) {
          const stored = replayed.store.get(key)
          if (stored === undefined) return `the store misses ${key}`
          if (stored.body !== item.body) return `the store holds another value for ${key}`
          if (!stored.open) return `the store holds ${key} closed`
        }
        for (const [key, stored] of replayed.store)
          if (stored.open && !held.has(key))
            return `the store holds ${key} open, which the view does not`
        return null
      },
    })
  })

  it('a batch that writes two obligations and two lists reports each of them', () => {
    const { log } = scene(random(7), { rounds: 2, executions: 1, finish: false })
    const last = log.at(-1)!
    const evidenceOf = (name: string) => evidence(`${last.execution}/${name}`)
    const batch: PublishedBatch = {
      ...last,
      pub: last.pub + 1,
      envelope: { ...last.envelope, op: 'two-obligations' as never, kinds: [] },
      facts: [
        {
          kind: 'finish.obligation',
          id: 'call/first',
          category: 'call',
          item: null,
          settled: false,
        },
        {
          kind: 'finish.obligation',
          id: 'call/second',
          category: 'call',
          item: null,
          settled: false,
        },
        ...[1, 2].map(list => ({
          kind: 'finish.obligations' as const,
          candidate: 'candidate' as never,
          list,
          count: 0,
          evidence: evidenceOf(`list-${String(list)}`),
          coverage: refOf({ coverage: list }),
          listed: refOf({ listed: list }),
        })),
      ],
    }
    const replayed = replay(log)
    if (typeof replayed === 'string') throw new Error(replayed)
    const { changes } = foldItems(replayed.view, batch)
    const opened = (family: string) =>
      changes.filter(change => change.family === family).map(change => change.item)
    expect(opened('obligation')).toEqual(['call/first', 'call/second'])
    expect(opened('list')).toHaveLength(2)
  })

  it('the open rows of the store rebuild the view the fold holds, execution by execution', () => {
    forAll('rebuild', {
      runs: 60,
      generate: rng => scene(rng),
      check: ({ log }) => {
        let view = emptySessionView()
        const rows = new Map<
          string,
          { execution: string; family: string; item: string; open: boolean; body: unknown }
        >()
        for (const batch of log) {
          const folded = foldItems(view, batch)
          for (const change of folded.changes)
            rows.set(JSON.stringify([batch.execution, change.family, change.item]), {
              execution: batch.execution,
              family: change.family,
              item: change.item,
              open: change.open,
              body: JSON.parse(JSON.stringify(change.body)) as unknown,
            })
          view = folded.view
        }
        for (const [execution, held] of view.executions) {
          const open = [...rows.values()].filter(row => row.execution === execution && row.open)
          const rebuilt = viewOfItems(execution, open)
          const text = (one: typeof held) =>
            viewText({ head: 0, executions: new Map([[execution, one]]) })
          if (text(rebuilt) !== text(held))
            return `${execution} rebuilds otherwise:\n${text(rebuilt).slice(0, 600)}\n${text(held).slice(0, 600)}`
        }
        return null
      },
    })
  })

  it('a later step that takes the same batch closes the earlier one', () => {
    const batch = { id: 'b-1' as never, watermark: evidence('watermark/b-1'), ordered: [] }
    const step = (n: number, pub: number): PublishedBatch => ({
      execution: 'exe_steps' as never,
      envelope: {
        op: `op-${String(n)}` as never,
        digest: `d-${String(n)}`,
        rev: 0,
        gen: '1',
        kinds: [],
      },
      facts: [
        { kind: 'step.begun', step: `step-${String(n)}` as never, batch },
        {
          kind: 'cursor.moved',
          step: `step-${String(n)}` as never,
          members: { inputBatch: 'b-1' },
        },
      ],
      pub,
    })
    const first = foldItems(emptySessionView(), step(1, 1))
    const second = foldItems(first.view, step(2, 2))
    const steps = second.view.executions.get('exe_steps' as never)!.steps
    expect(steps.map(item => item.step)).toEqual(['step-2'])
    expect(second.changes).toContainEqual(
      expect.objectContaining({ family: 'step', item: 'step-1#b-1', open: false }),
    )
  })

  it('a request stays open while its step is current, or as the fallback when the current one is voided', () => {
    const at = (n: number) => `step-${String(n)}` as never
    const ref = { digest: 'a'.repeat(64), size: 2 }
    const batch = (pub: number, facts: PublishedBatch['facts']): PublishedBatch => ({
      execution: 'exe_requests' as never,
      envelope: {
        op: `op-${String(pub)}` as never,
        digest: `d-${String(pub)}`,
        rev: 0,
        gen: '1',
        kinds: [],
      },
      facts,
      pub,
    })
    const adopt = (n: number, pub: number) =>
      batch(pub, [
        { kind: 'cursor.moved', step: at(n), members: { step: at(n) } },
        {
          kind: 'request.adopted',
          step: at(n),
          attempt: 0 as never,
          reference: `ref-${String(n)}` as never,
          fixed: evidence(`fixed/${String(n)}`),
          schema: { owner: 'suite', name: 'request', revision: '1', digest: 'suite:request' },
          record: ref,
          coverage: null,
        },
      ])
    let view = emptySessionView()
    const changes: { item: string; open: boolean }[] = []
    for (const next of [adopt(1, 1), adopt(2, 2), adopt(3, 3)]) {
      const folded = foldItems(view, next)
      changes.push(...folded.changes.filter(c => c.family === 'request'))
      view = folded.view
    }
    const requests = () => view.executions.get('exe_requests' as never)!.requests
    // Step 3 is current; step 2 is the fallback; step 1 closed when step 3 came.
    expect(requests().map(item => item.reference)).toEqual(['ref-2', 'ref-3'])
    expect(changes).toContainEqual(expect.objectContaining({ item: 'ref-1', open: false }))
    view = foldItems(
      view,
      batch(4, [
        {
          kind: 'intent.voided',
          intent: 'model',
          step: at(3),
          attempt: 0 as never,
          action: 'action-3' as never,
          reference: 'ref-3' as never,
          cause: 'not-accepted',
          basis: evidence('voided/3'),
        },
      ]),
    ).view
    expect(view.executions.get('exe_requests' as never)!.adopted?.reference).toBe('ref-2')
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
