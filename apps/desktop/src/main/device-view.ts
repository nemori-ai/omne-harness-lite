import {
  DEVICE_VIEW,
  VIEW_MARK,
  VIEW_STRUCTURE,
  viewAskedOf,
  viewQuery,
  type ViewAsked,
  type ViewCannot,
} from '../shared/view.ts'
import type { LocalRoute } from './app-protocol.ts'
import { watchMount, type WatchedContents } from './page-mount.ts'

export type Shot = Readonly<{ png: Uint8Array<ArrayBuffer>; width: number; height: number }>

/** A window that is never shown: Electron's in the application, a stand-in in a test. */
export type LookWindow = Readonly<{
  contents: WatchedContents
  /** Starts loading the page with this query; the watch is armed before. */
  load(query: string): void
  capture(width: number, height: number): Promise<Shot>
  close(): void
}>

export type DeviceViewDeps = Readonly<{
  /** A window of the content size asked for, in the session the application window uses; undefined where there can be none. */
  open(width: number, height: number): LookWindow | undefined
  /** From the start of the load to the page saying it is drawn. */
  deadlineMs: number
  pollMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}>

export type Looked =
  | Readonly<{ kind: 'image'; structure?: unknown } & Shot>
  | Readonly<{ kind: 'cannot'; reason: ViewCannot }>

const POLL_MS = 100
const MARKED = `document.documentElement.getAttribute(${JSON.stringify(VIEW_MARK)})`
const STRUCTURED = `document.documentElement.getAttribute(${JSON.stringify(VIEW_STRUCTURE)})`

async function structureOf(contents: WatchedContents): Promise<unknown> {
  const said: unknown = await contents.executeJavaScript(STRUCTURED)
  if (typeof said !== 'string') return undefined
  try {
    return JSON.parse(said) as unknown
  } catch {
    return undefined
  }
}
const SAID: ReadonlySet<unknown> = new Set(['no-page', 'no-skin', 'bad-mode'])

const cannot = (reason: ViewCannot): Looked => ({ kind: 'cannot', reason })
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** Opens a window for one request, waits for the page to say it is drawn, takes the picture and closes the window. */
export async function lookOnce(deps: DeviceViewDeps, asked: ViewAsked): Promise<Looked> {
  const { deadlineMs, pollMs = POLL_MS, now = Date.now, sleep = pause } = deps
  const window = deps.open(asked.width, asked.height)
  if (window === undefined) return cannot('unsupported')
  try {
    const start = now()
    const mounting = watchMount(window.contents, deadlineMs)
    window.load(viewQuery(asked))
    if ((await mounting) !== 'mounted') return cannot('not-settled')
    for (;;) {
      const mark = await window.contents.executeJavaScript(MARKED)
      if (mark === 'ready') {
        const shot = await window.capture(asked.width, asked.height)
        const structure = await structureOf(window.contents)
        return { kind: 'image', ...shot, ...(structure === undefined ? {} : { structure }) }
      }
      if (SAID.has(mark)) return cannot(mark as ViewCannot)
      if (now() - start >= deadlineMs) return cannot('not-settled')
      await sleep(pollMs)
    }
  } finally {
    window.close()
  }
}

async function bodyOf(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text())
  } catch {
    return undefined
  }
}

const reasonOf = (reason: ViewCannot): Response =>
  new Response(JSON.stringify({ reason }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const pictureOf = ({ png, width, height, structure }: Shot & { structure?: unknown }): Response =>
  structure === undefined
    ? pngOf({ png, width, height })
    : new Response(
        JSON.stringify({ png: Buffer.from(png).toString('base64'), width, height, structure }),
        {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        },
      )

export const pngOf = ({ png, width, height }: Shot): Response =>
  new Response(png, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
      'x-omne-width': String(width),
      'x-omne-height': String(height),
    },
  })

/** `POST /device/view`: one window at a time; the others wait their turn in the order they came. */
export function deviceViewRoute(deps: DeviceViewDeps): LocalRoute {
  let turn: Promise<unknown> = Promise.resolve()
  return request => {
    if (new URL(request.url).pathname !== DEVICE_VIEW) return undefined
    if (request.method !== 'POST') return Promise.resolve(new Response(null, { status: 405 }))
    return (async () => {
      const asked = viewAskedOf(await bodyOf(request))
      if (asked === undefined) return reasonOf('bad-mode')
      const mine = turn.then(() => lookOnce(deps, asked))
      turn = mine.catch(() => undefined)
      const looked = await mine
      return looked.kind === 'image' ? pictureOf(looked) : reasonOf(looked.reason)
    })()
  }
}
