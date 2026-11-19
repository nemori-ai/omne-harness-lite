import type { AgentEvent, EventPage, Failure } from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { getEventListeners } from 'node:events'
import { expect, it } from 'vitest'
import { eventsAfter, newTurns, turn, type Standing } from '../src/cordis/event-stream.ts'

// The stream over scripted reads: what it yields and when it ends, with no journal behind it.

const event = (sequence: string, kind: string): AgentEvent =>
  ({ sequence, body: { kind } }) as unknown as AgentEvent

const page = (kinds: readonly [string, string][], next: string): EventPage => ({
  kind: 'page',
  events: kinds.map(([sequence, kind]) => event(sequence, kind)),
  next,
  caughtUp: true,
})

const EMPTY = page([], '0')

type Read = (after: string | null) => Promise<Outcome<Standing, Failure>>

async function drained(
  read: Read,
  signal = new AbortController().signal,
  turns = newTurns(),
): Promise<Outcome<EventPage, Failure>[]> {
  const seen: Outcome<EventPage, Failure>[] = []
  for await (const answer of eventsAfter(read, null, turns, signal)) seen.push(answer)
  return seen
}

it('a failed read is yielded and ends the stream', async () => {
  const failure: Failure = { kind: 'unavailable', owner: 'suite', diagnostic: 'no' }
  let reads = 0
  const seen = await drained(async () => {
    reads += 1
    return fail(failure)
  })
  expect(seen).toEqual([{ failure }])
  expect(reads).toBe(1)
})

it('a gap is yielded and ends the stream', async () => {
  const gap: EventPage = { kind: 'gap', retainedFrom: '4', recovery: {} as never }
  let reads = 0
  const seen = await drained(async () => {
    reads += 1
    return succeed({ page: gap, ended: false })
  })
  expect(seen).toEqual([{ ok: gap }])
  expect(reads).toBe(1)
})

it('each page is read after the one before it, and the page that holds the end is the last', async () => {
  const first = page([['1', 'message']], '1')
  const last = page(
    [
      ['2', 'message'],
      ['3', 'ended'],
    ],
    '3',
  )
  const asked: (string | null)[] = []
  const seen = await drained(async after => {
    asked.push(after)
    return succeed({ page: after === null ? first : last, ended: false })
  })
  expect(seen).toEqual([{ ok: first }, { ok: last }])
  expect(asked).toEqual([null, '1'])
})

it('an empty page of an ended execution ends the stream without a wait, and is not yielded', async () => {
  const seen = await drained(async () => succeed({ page: EMPTY, ended: true }))
  expect(seen).toEqual([])
})

it('a turn that comes while a page is read is not waited for again', async () => {
  const turns = newTurns()
  const after = page([['1', 'ended']], '1')
  let reads = 0
  // The first read comes back empty, and the book turns before the stream can wait.
  const seen = await drained(
    async () => {
      reads += 1
      if (reads > 1) return succeed({ page: after, ended: false })
      turn(turns)
      return succeed({ page: EMPTY, ended: false })
    },
    undefined,
    turns,
  )
  expect(seen).toEqual([{ ok: after }])
  expect(turns.waiting.size).toBe(0)
})

it('caught up, the stream reads nothing until the book turns, then reads once more', async () => {
  const turns = newTurns()
  const stop = new AbortController()
  const after = page([['1', 'ended']], '1')
  let reads = 0
  const done = drained(
    async () => {
      reads += 1
      return succeed(reads === 1 ? { page: EMPTY, ended: false } : { page: after, ended: false })
    },
    stop.signal,
    turns,
  )
  await new Promise(resolve => setTimeout(resolve, 20))
  expect([reads, turns.waiting.size]).toEqual([1, 1])
  expect(getEventListeners(stop.signal, 'abort')).toHaveLength(1)
  turn(turns)
  expect(await done).toEqual([{ ok: after }])
  expect([reads, turns.waiting.size]).toEqual([2, 0])
  // A wait that a turn ended leaves nothing on the reader's signal: waits do not pile up on it.
  expect(getEventListeners(stop.signal, 'abort')).toHaveLength(0)
})

it('a reader that leaves while the stream waits ends it and leaves no waiter behind', async () => {
  const turns = newTurns()
  const stop = new AbortController()
  let reads = 0
  const done = drained(
    async () => {
      reads += 1
      return succeed({ page: EMPTY, ended: false })
    },
    stop.signal,
    turns,
  )
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(turns.waiting.size).toBe(1)
  stop.abort()
  expect(await done).toEqual([])
  expect([reads, turns.waiting.size]).toEqual([1, 0])
  // A later turn finds nobody: the waiter was withdrawn, not left to fire.
  turn(turns)
  expect(reads).toBe(1)
})

it('a reader that has left before the first read gets nothing and no read is made', async () => {
  const stop = new AbortController()
  stop.abort()
  let reads = 0
  const seen = await drained(async () => {
    reads += 1
    return succeed({ page: EMPTY, ended: false })
  }, stop.signal)
  expect([seen, reads]).toEqual([[], 0])
})

it('every waiter is woken by one turn, and a turn with nobody waiting only counts', () => {
  const turns = newTurns()
  const woken: number[] = []
  turns.waiting.add(() => woken.push(1))
  turns.waiting.add(() => woken.push(2))
  turn(turns)
  expect([woken, turns.count, turns.waiting.size]).toEqual([[1, 2], 1, 0])
  turn(turns)
  expect([woken, turns.count]).toEqual([[1, 2], 2])
})
