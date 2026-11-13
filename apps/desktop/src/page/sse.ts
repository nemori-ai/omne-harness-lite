// Reads the data of each SSE event of a `fetch` response. The browser's `EventSource` cannot POST
// and reconnects on its own; the bridge needs neither.
import { createParser } from 'eventsource-parser'

/** Yields each event's data until the stream ends; returns whether it ended or broke. */
export async function* sseData(response: Response): AsyncGenerator<string, 'ended' | 'broke'> {
  const body = response.body
  if (body === null) return 'broke'
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  const queue: string[] = []
  const parser = createParser({ onEvent: event => queue.push(event.data) })
  try {
    for (;;) {
      for (let data = queue.shift(); data !== undefined; data = queue.shift()) yield data
      const chunk = await reader.read().catch(() => undefined)
      if (chunk === undefined) return 'broke'
      if (chunk.done) return 'ended'
      parser.feed(chunk.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}
