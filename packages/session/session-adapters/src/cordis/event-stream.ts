import type { EventPage, Failure } from '@omne-harness/agent-contract'
import type { Outcome } from '@omne-harness/operation-result'

// The page of the events stream: the read limit of the core.
export const EVENT_PAGE = 100

type Page = Outcome<EventPage, Failure>

// The events already there, page by page: each page is read through the round that reads closed
// events back. Answers where the stream stands once it caught up (null: it ended or failed).
export async function* pagesThere(
  read: (after: string | null) => Promise<Page>,
  from: string | null,
): AsyncGenerator<Page, Readonly<{ after: string | null }> | null> {
  let after = from
  for (;;) {
    const page = await read(after)
    if ('failure' in page || page.ok.kind === 'gap') {
      yield page
      return null
    }
    if (page.ok.events.length === 0) return { after }
    yield page
    after = page.ok.next
    if (page.ok.events.some(event => event.body.kind === 'ended')) return null
  }
}
