// SS-21 at the Journal read layer (perf-baseline 2.1 to 2.3, two sizes): reading the unread prefix
// after a progress mark costs the same number of storage reads and returns the same number of
// events whether the execution has N or 10 N events before the mark. A read from the start is the
// negative control: it grows with N. The counts are deterministic: storage calls and events, not
// time. They cover the provider's reads on a kept copy; the rebuild of a copy reads the whole
// state of the session once (SPEC K-8) and is counted separately.
import { describe, expect, it } from 'vitest'
import { assistantMessage, evidence } from '@omne-harness/session-contract/testing'
import type { EventPage } from '@omne-harness/agent-contract'
import { ok, operation } from './fixtures/common-journal.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const PAGE = 5

async function withEvents(name: string, events: number) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  for (let index = 0; index < events; index += 1) {
    const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(`event-${index}`),
        authority: open.authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, position: `E${index}` },
        state: { kind: 'advancing' },
        events: [
          {
            kind: 'message',
            message: assistantMessage(`m${index}`),
            source: evidence(`m${index}`),
          },
        ],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
  }
  return s
}

/** One page after `after`: the storage reads it took and the events it returned. */
async function page(s: SqlScene, after: string | null) {
  const reads = s.controls?.reads ?? []
  const start = reads.length
  const result = ok(
    await s.view.journal.output.read({ ...s.access, execution: s.execution, after, limit: PAGE }),
  )
  if (result.kind !== 'page') throw new Error('a page is expected')
  return { reads: reads.length - start, events: result.events.length }
}

describe('reading the unread prefix after the progress mark', () => {
  it('takes the same reads and returns the same events at N = 10 and N = 100', async () => {
    const small = await withEvents('complexity-small', 10)
    const large = await withEvents('complexity-large', 100)
    const tailOf = (n: number) => String(n - 2)
    const counts = [await page(small, tailOf(10)), await page(large, tailOf(100))]
    expect(counts[0]).toEqual(counts[1])
    expect(counts[0]!.events).toBeLessThanOrEqual(PAGE)
    expect(counts[0]!.reads).toBe(1)
  })

  it('negative control: walking the whole log from the start grows with N', async () => {
    const small = await withEvents('complexity-walk-small', 10)
    const large = await withEvents('complexity-walk-large', 30)
    const walk = async (s: SqlScene) => {
      let after: string | null = null
      let pages = 0
      for (;;) {
        const result: EventPage = ok(
          await s.view.journal.output.read({
            ...s.access,
            execution: s.execution,
            after,
            limit: PAGE,
          }),
        )
        if (result.kind !== 'page') throw new Error('a page is expected')
        pages += 1
        if (result.caughtUp || result.events.length === 0) return pages
        after = result.next
      }
    }
    expect(await walk(large)).toBeGreaterThan(await walk(small))
  })
})
