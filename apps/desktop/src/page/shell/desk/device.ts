import type { Point, Rect } from '../../desk/scene.ts'

/** What the main process says of this machine while a lease is open (src/main/device-figure.ts). */
export type FigureFacts = Readonly<{ screen: Rect; content: Rect; visible: boolean }>

export type FigureAbilities = Readonly<{ leave: boolean; read: boolean }>

/** The frontmost window at a point: omne's own, another app's, or none. Points are logical points on the screen. */
export type WindowAt =
  | Readonly<{ kind: 'none' | 'own' }>
  | Readonly<{
      kind: 'other'
      id: string
      app: string
      title: string
      bounds: Rect
      covered: readonly Rect[]
    }>

export type WindowRead =
  | Readonly<{ kind: 'picture'; png: Uint8Array; bounds: Rect; scale: number; takenAt: number }>
  | Readonly<{ kind: 'not-authorized' }>
  | Readonly<{ kind: 'gone' }>
  | Readonly<{ kind: 'failed'; reason: string }>

export type LeaseListener = Readonly<{
  opened(lease: number, facts: FigureFacts): void
  facts(facts: FigureFacts): void
  ended(): void
}>

/** `own` answers null when it cannot tell (no backend, an error): the point counts as not covered. */
export type FigureDevice = Readonly<{
  abilities(): Promise<FigureAbilities>
  lease(listener: LeaseListener): () => void
  mode(lease: number, mode: Readonly<{ hold: boolean; keys: boolean }>): void
  front(): void
  own(at: Point): Promise<boolean | null>
  window(at: Point): Promise<WindowAt>
  read(lease: number, window: string): Promise<WindowRead>
  settings(): void
}>

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const DEVICE_FIGURE = '/device/figure'
const DEVICE_SCREEN_SETTINGS = '/device/screen/settings'

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

const NONE: WindowAt = { kind: 'none' }
const FAILED = '读窗口的请求没有成功'

const isText = (value: unknown): boolean => typeof value === 'string'
const isRects = (value: unknown): boolean => Array.isArray(value) && value.every(isRect)
const OTHER: Readonly<Record<string, (value: unknown) => boolean>> = {
  id: isText,
  app: isText,
  title: isText,
  bounds: isRect,
  covered: isRects,
}
const isOther = (window: Fields): boolean =>
  window['kind'] === 'other' && Object.entries(OTHER).every(([key, is]) => is(window[key]))

function windowOf(value: unknown): WindowAt {
  const window = fields(value)
  if (window?.['kind'] === 'own') return { kind: 'own' }
  return window !== undefined && isOther(window) ? (window as WindowAt) : NONE
}

function boundsOf(header: string | null): Rect | undefined {
  const [x, y, width, height] = (header ?? '').split(',').map(Number)
  const rect = { x, y, width, height }
  return isRect(rect) ? rect : undefined
}

async function pictureOf(response: Response): Promise<WindowRead> {
  const bounds = boundsOf(response.headers.get('x-omne-window-bounds'))
  const scale = Number(response.headers.get('x-omne-window-scale'))
  const takenAt = Number(response.headers.get('x-omne-taken-at'))
  if (bounds === undefined || !(scale > 0) || !(takenAt > 0))
    return { kind: 'failed', reason: FAILED }
  const png = new Uint8Array(await response.arrayBuffer())
  return { kind: 'picture', png, bounds, scale, takenAt }
}

async function refusalOf(response: Response): Promise<WindowRead> {
  if (response.status === 404 || response.status === 409) return { kind: 'gone' }
  const body = fields(await response.json().catch(() => null))
  if (response.status === 403 && body?.['reason'] === 'not-authorized')
    return { kind: 'not-authorized' }
  const detail = body?.['detail']
  return { kind: 'failed', reason: typeof detail === 'string' ? detail : FAILED }
}

const readOf = async (response: Response): Promise<WindowRead> =>
  response.ok ? pictureOf(response) : refusalOf(response)

const pointQuery = (at: Point): string => `?x=${at.x}&y=${at.y}`

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
  abilities: () => Promise.resolve({ leave: false, read: false }),
  lease: listener => {
    queueMicrotask(() => listener.ended())
    return () => undefined
  },
  mode: () => undefined,
  front: () => undefined,
  own: () => Promise.resolve(null),
  window: () => Promise.resolve(NONE),
  read: () => Promise.resolve({ kind: 'gone' }),
  settings: () => undefined,
}

/** The page's side of `/device/figure`: the routes the shell calls on the desktop app's main process. */
export function hostFigure(fetcher: Fetcher = (input, init) => fetch(input, init)): FigureDevice {
  const post = (path: string, body?: object) =>
    void fetcher(`${DEVICE_FIGURE}${path}`, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => undefined)
  return {
    async abilities() {
      const response = await fetcher(DEVICE_FIGURE).catch(() => null)
      if (response?.ok !== true) return { leave: false, read: false }
      const body = fields(await response.json().catch(() => null))
      return { leave: body?.['leave'] === true, read: body?.['read'] === true }
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
    async own(at) {
      const response = await fetcher(`${DEVICE_FIGURE}/own${pointQuery(at)}`).catch(() => null)
      if (response?.ok !== true) return null
      const own = fields(await response.json().catch(() => null))?.['own']
      return typeof own === 'boolean' ? own : null
    },
    async window(at) {
      const response = await fetcher(`${DEVICE_FIGURE}/window${pointQuery(at)}`).catch(() => null)
      if (response?.ok !== true) return NONE
      return windowOf(await response.json().catch(() => null))
    },
    async read(lease, window) {
      const response = await fetcher(`${DEVICE_FIGURE}/read?lease=${lease}`, {
        method: 'POST',
        body: JSON.stringify({ window }),
      }).catch(() => null)
      const failed: WindowRead = { kind: 'failed', reason: FAILED }
      return response === null ? failed : readOf(response).catch(() => failed)
    },
    settings: () => void fetcher(DEVICE_SCREEN_SETTINGS, { method: 'POST' }).catch(() => undefined),
  }
}
