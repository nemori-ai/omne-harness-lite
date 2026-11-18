import { expect, it, vi } from 'vitest'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'
import { keptToolCall } from './fixtures/tool-call.ts'

it('a live stream of events goes on across the writes after which the replica is rebuilt', async () => {
  const s = await sqlScene('events-live')
  const stop = new AbortController()
  try {
    const journal = s.view.journal
    const { authority } = ok(await journal.open(s.openInput))
    const seen: string[] = []
    const failed: unknown[] = []
    const stream = journal.output.events({
      ...s.access,
      execution: s.execution,
      after: null,
      signal: stop.signal,
    })
    const pump = (async () => {
      try {
        for await (const answer of stream) {
          const page = ok(answer)
          if (page.kind !== 'page') throw new Error(`the stream answered ${page.kind}`)
          seen.push(...page.events.map(event => event.body.kind))
        }
      } catch (error) {
        failed.push(error)
      }
    })()
    const load = async () => ok(await journal.load({ ...s.access, execution: s.execution }))
    const commit = async (name: string, change: object) => {
      const loaded = await load()
      ok(
        await journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation(name),
          authority,
          expected: loaded.revision,
          checkpoint: loaded.checkpoint,
          state: { kind: 'advancing' },
          events: [],
          effects: [],
          caller: { kind: 'none' },
          replyAdmission: null,
          handoff: null,
          finish: null,
          ...change,
        }),
      )
    }
    const tool = await keptToolCall({ view: s.view, access: s.access, execution: s.execution })
    const waits = [{ kind: 'producer' as const, pending: tool.pending }]
    await commit('wait', {
      checkpoint: { ...(await load()).checkpoint, calls: [tool.pending] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [{ action: tool.pending.action, pending: tool.pending, authority }],
    })
    await vi.waitFor(() => expect(seen).toContain('waiting'))
    // Caught up, the stream waits: it reads nothing until the book turns.
    let reads = 0
    s.rewriteReads.current = (_request, answer) => {
      reads += 1
      return answer
    }
    await new Promise(resolve => setTimeout(resolve, 50))
    s.rewriteReads.current = null
    expect(reads).toBe(0)
    // The step lets the call go: open items close, and the provider rebuilds its replica.
    await commit('let-go', { checkpoint: { ...(await load()).checkpoint, calls: [] } })
    for (const step of [1, 2]) await commit(`later-${String(step)}`, {})
    ok(
      await journal.control({
        ...s.access,
        execution: s.execution,
        operation: operation('cancel'),
        command: { kind: 'cancel', reason: evidence('cancel') },
      }),
    )
    // The event of a write made on the rebuilt replica reaches the stream that was already open.
    await vi.waitFor(
      () => expect([failed, seen]).toEqual([[], expect.arrayContaining(['control'])]),
      {
        timeout: 5000,
      },
    )
    stop.abort()
    await pump
    expect(failed).toEqual([])
  } finally {
    stop.abort()
    await s.close()
  }
})
