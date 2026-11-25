import type { Rect } from '../../desk/scene.ts'

/** What the main process says of this machine while a lease is open (src/main/device-figure.ts). */
export type FigureFacts = Readonly<{ screen: Rect; content: Rect; visible: boolean }>

export type LeaseListener = Readonly<{
  opened(lease: number, facts: FigureFacts): void
  facts(facts: FigureFacts): void
  ended(): void
}>

export type FigureDevice = Readonly<{
  leave(): Promise<boolean>
  lease(listener: LeaseListener): () => void
  mode(lease: number, mode: Readonly<{ hold: boolean; keys: boolean }>): void
  front(): void
}>

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const DEVICE_FIGURE = '/device/figure'

type Fields = Readonly<Record<string, unknown>>
const fields = (value: unknown): Fields | undefined =>
  typeof value === 'object' && value !== null ? (value as Fields) : undefined
const isRect = (value: unknown): value is Rect =>
  ['x', 'y', 'width', 'height'].every(key => Number.isFinite(fields(value)?.[key]))
function factsOf(value: unknown): FigureFacts | undefined {
  const facts = fields(value)
  return facts !== undefined &&
    isRect(facts['screen']) &&
    isRect(facts['content']) &&
    typeof facts['visible'] === 'boolean'
    ? (facts as FigureFacts)
    : undefined
}

function parsed(line: string): Fields | undefined {
  try {
    return fields(JSON.parse(line))
  } catch {
    return undefined
  }
}

/** Reads the lease's stream line by line; resolves when the stream is done, rejects when it breaks. */
async function readLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  take: (line: string) => void,
) {
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end = buffer.indexOf('\n')
    while (end >= 0) {
      take(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      end = buffer.indexOf('\n')
    }
  }
}

/** A page with no host to ask: the figure lifts and goes back, and never leaves. */
export const NO_FIGURE_DEVICE: FigureDevice = {
  leave: () => Promise.resolve(false),
  lease: listener => {
    queueMicrotask(() => listener.ended())
    return () => undefined
  },
  mode: () => undefined,
  front: () => undefined,
}

/** The page's side of `/device/figure`: the routes the shell calls on the desktop app's main process. */
export function hostFigure(fetcher: Fetcher = (input, init) => fetch(input, init)): FigureDevice {
  const post = (path: string, body?: object) =>
    void fetcher(`${DEVICE_FIGURE}${path}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => undefined)
  return {
    async leave() {
      const response = await fetcher(DEVICE_FIGURE).catch(() => null)
      if (response?.ok !== true) return false
      const body = await response.json().catch(() => null)
      return fields(body)?.['leave'] === true
    },
    lease(listener) {
      const abort = new AbortController()
      let over = false
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      const end = () => {
        if (over) return
        over = true
        listener.ended()
      }
      const take = (text: string) => {
        const line = parsed(text)
        const facts = factsOf(line?.['facts'])
        if (over || line === undefined) return
        if (line['ended'] === true) end()
        else if (Number.isSafeInteger(line['lease']) && facts !== undefined)
          listener.opened(line['lease'] as number, facts)
        else if (facts !== undefined) listener.facts(facts)
      }
      void (async () => {
        const response = await fetcher(`${DEVICE_FIGURE}/lease`, {
          method: 'POST',
          signal: abort.signal,
        })
        if (!response.ok || response.body === null) return
        reader = response.body.getReader()
        if (over) return void reader.cancel().catch(() => undefined)
        await readLines(reader, take)
      })()
        .catch(() => undefined)
        .finally(end)
      return () => {
        over = true
        abort.abort()
        void reader?.cancel().catch(() => undefined)
      }
    },
    mode: (lease, mode) => post(`/mode?lease=${lease}`, mode),
    front: () => post('/front'),
  }
}
