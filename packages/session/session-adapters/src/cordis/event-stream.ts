import type { EventPage, Failure } from '@omne-harness/agent-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'

// The page of the events stream: the read limit of the core.
export const EVENT_PAGE = 100

// A book turns with every publication it learns of: its own, and what it adopts of another writer.
export type Turns = { count: number; readonly waiting: Set<() => void> }

export const newTurns = (): Turns => ({ count: 0, waiting: new Set() })

export function turn(turns: Turns): void {
  turns.count += 1
  const waiting = [...turns.waiting]
  turns.waiting.clear()
  for (const wake of waiting) wake()
}

function turnedSince(turns: Turns, at: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (turns.count !== at || signal.aborted) return resolve()
    const wake = () => {
      signal.removeEventListener('abort', wake)
      turns.waiting.delete(wake)
      resolve()
    }
    turns.waiting.add(wake)
    signal.addEventListener('abort', wake, { once: true })
  })
}

// One page after a place, and whether the execution had ended when the page was read.
export type Standing = Readonly<{ page: EventPage; ended: boolean }>

// The events after a place, in order, until the execution ends or the reader leaves. Every page is
// one read of the book, so the stream outlives any replica; caught up, it waits for the next turn.
export async function* eventsAfter(
  read: (after: string | null) => Promise<Outcome<Standing, Failure>>,
  from: string | null,
  turns: Turns,
  signal: AbortSignal,
): AsyncGenerator<Outcome<EventPage, Failure>> {
  let after = from
  while (!signal.aborted) {
    const at = turns.count
    const found = await read(after)
    if ('failure' in found) {
      yield found
      return
    }
    const { page, ended } = found.ok
    if (page.kind === 'gap' || page.events.length > 0) yield succeed(page)
    if (page.kind === 'gap') return
    if (page.events.length > 0) {
      if (page.events.some(event => event.body.kind === 'ended')) return
      after = page.next
    } else if (ended) return
    else await turnedSince(turns, at, signal)
  }
}
