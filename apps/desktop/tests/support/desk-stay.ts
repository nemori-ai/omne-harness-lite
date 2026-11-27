import { crc32, deflateSync } from 'node:zlib'
import { vi } from 'vitest'
import type {
  ItemOf,
  Projection,
  SayItem,
  SayOutcome,
  SayTarget,
  ShellSlots,
  SlotConflict,
  SlotName,
} from '@omne-harness/shell-contract'
import type { FigureHand } from '@omne-harness/ui-kit'
import type { Down, Look, LookDown, Point, Scene } from '../../src/page/desk/scene.ts'
import { hostFigure } from '../../src/page/shell/desk/device.ts'
import { figureLink } from '../../src/page/shell/desk/link.ts'
import { createShellNote } from '../../src/page/shell/say-note.ts'
import { createStay } from '../../src/page/shell/desk/stay.ts'
import { createToldBoard, type Watched } from '../../src/page/shell/state.ts'

const SCREEN = { x: 0, y: 0, width: 1440, height: 900 }
const CONTENT = { x: 100, y: 50, width: 800, height: 600 }
export const FACTS = { screen: SCREEN, content: CONTENT, visible: true }
export const LOOK: Look = { theme: 'light', size: 'medium', reduced: false }
export const SCOPE = 'tenant-a'
const encoder = new TextEncoder()

type Sent = { url: string; method: string; body: unknown }
type Answer = Response | Promise<Response>

/** The routes `own`, `window` and `read` stood in for; `read` in GET /device/figure says whether there is a window backend. */
export type Routes = {
  read: boolean
  own: (at: Point) => Answer
  window: (at: Point) => Answer
  shot: (window: unknown) => Answer
}

const ROUTES: Routes = {
  read: false,
  own: () => Response.json({ reason: 'not-found' }, { status: 404 }),
  window: () => Response.json({ reason: 'not-found' }, { status: 404 }),
  shot: () => Response.json({ reason: 'not-found' }, { status: 404 }),
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

/** A plain grey RGB PNG of the given size in physical pixels. */
export function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x80)
  for (let row = 0; row < height; row += 1) rows[row * (width * 3 + 1)] = 0
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const file = Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', new Uint8Array()),
  ])
  return new Uint8Array(file)
}

/** The width and height a PNG says it has. */
export const sizeOf = (bytes: Uint8Array): readonly [number, number] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return [view.getUint32(16), view.getUint32(20)]
}

/** The answer of `read` for a picture: the PNG and its three headers. */
export const shotOf = (
  picture: Uint8Array<ArrayBuffer>,
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  scale: number,
  takenAt: number,
) =>
  new Response(picture, {
    headers: {
      'content-type': 'image/png',
      'x-omne-window-bounds': `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
      'x-omne-window-scale': String(scale),
      'x-omne-taken-at': String(takenAt),
    },
  })

/** A clock moved by hand: `later` runs when `tick` passes its time. */
function manualClock() {
  let now = 0
  let timers: { at: number; run: () => void }[] = []
  return {
    clock: {
      now: () => now,
      later(ms: number, run: () => void) {
        const timer = { at: now + ms, run }
        timers.push(timer)
        return () => void (timers = timers.filter(each => each !== timer))
      },
    },
    tick(ms: number) {
      now += ms
      const due = timers.filter(timer => timer.at <= now)
      timers = timers.filter(timer => timer.at > now)
      for (const timer of due) timer.run()
    },
  }
}

const pointOf = (url: string): Point => {
  const query = new URL(url, 'http://x').searchParams
  return { x: Number(query.get('x')), y: Number(query.get('y')) }
}

/** One item for the say slot, with every call it was given written down. */
export function sayItem(
  id: string,
  given: Partial<{
    targets: () => readonly SayTarget[] | undefined
    current: () => string | undefined
    say: () => Promise<SayOutcome>
    pictures: () => boolean
  }> = {},
) {
  const said: unknown[][] = []
  const shown: unknown[][] = []
  const asked: unknown[] = []
  const listeners = new Set<() => void>()
  const item: SayItem = {
    id,
    targets: scope => {
      asked.push(scope)
      return (given.targets ?? (() => [{ key: 's-1', label: '周报' }]))()
    },
    current: () => (given.current ?? (() => undefined))(),
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    say: (...args) => {
      said.push(args)
      return (given.say ?? (() => Promise.resolve({ kind: 'sent', key: 's-1' } as const)))()
    },
    show: (...args) => void shown.push(args),
    ...(given.pictures === undefined ? {} : { pictures: given.pictures }),
  }
  const changed = () => {
    for (const listener of listeners) listener()
  }
  return { item, said, shown, asked, changed, listening: () => listeners.size }
}

/** The shell's say slot stood in for: at most one item, or two that conflict. */
export function sayPlace() {
  let items: SayItem[] = []
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }
  const conflicts = (): SlotConflict[] =>
    items.length > 1 ? [{ slot: 'say', anchor: undefined, id: 'say', by: ['a', 'b'] }] : []
  const slots: ShellSlots = {
    items: <K extends SlotName>(slot: K) =>
      (slot === 'say' && items.length === 1 ? items : []) as unknown as readonly ItemOf<K>[],
    conflicts: slot => (slot === 'say' ? conflicts() : []),
    subscribe: (slot, listener) => {
      if (slot !== 'say') return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    slots,
    put(item: SayItem) {
      items = [...items, item]
      changed()
    },
    take(item: SayItem) {
      items = items.filter(each => each !== item)
      changed()
    },
  }
}

type Place = ReturnType<typeof sayPlace>

/** The projection the shell's service made, stood in for: none until a case makes one. */
function projected() {
  let value: Projection | undefined
  const listeners = new Set<(value: Projection | undefined) => void>()
  const watched: Watched<Projection | undefined> = {
    get: () => value,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const make = (next: Projection) => {
    value = next
    for (const listener of Array.from(listeners)) listener(next)
  }
  return { watched, make }
}

export const ISSUER = 'shell-1'

/** The shell's stay with the routes of /device/figure, the channel and the say slot stood in for. */
export function harness(
  device: 'leave' | 'stay' | 'unreadable' = 'leave',
  place?: Place,
  given: Partial<Routes> = {},
) {
  const routes: Routes = { ...ROUTES, ...given }
  const time = manualClock()
  const sent: Sent[] = []
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const cancelled: number[] = []
  let refuse = false
  const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    sent.push({ url, method: init?.method ?? 'GET', body })
    if (url === '/device/figure') {
      if (device === 'unreadable') throw new TypeError('no route')
      return Response.json({ leave: device === 'leave', read: routes.read })
    }
    if (url.startsWith('/device/figure/own?')) return routes.own(pointOf(url))
    if (url.startsWith('/device/figure/window?')) return routes.window(pointOf(url))
    if (url.startsWith('/device/figure/read?')) return routes.shot(body)
    if (url === '/device/figure/lease') {
      if (refuse) return new Response(null, { status: 404 })
      const index = streams.length
      const stream = new ReadableStream<Uint8Array>({
        start: controller => void streams.push(controller),
        cancel: () => void cancelled.push(index),
      })
      return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
    }
    return new Response(null, { status: 204 })
  }
  const listeners = new Set<(event: MessageEvent) => void>()
  const posted: (Down | LookDown)[] = []
  const channel = {
    postMessage: (data: Down | LookDown) => void posted.push(structuredClone(data)),
    addEventListener: (_type: 'message', listener: (event: MessageEvent) => void) =>
      void listeners.add(listener),
    removeEventListener: (_type: 'message', listener: (event: MessageEvent) => void) =>
      void listeners.delete(listener),
    close: () => listeners.clear(),
  }
  let seat: { x: number; y: number } | null = { x: 40, y: 560 }
  let scope: string | undefined = SCOPE
  const goHome = vi.fn()
  let changed: (() => void) | undefined
  const projection = projected()
  const warned: string[] = []
  const navigated: unknown[][] = []
  const told = createToldBoard()
  told.room(true)
  const note = createShellNote({ slots: (place ?? sayPlace()).slots, scope: () => scope })
  const stay = createStay({
    device: hostFigure(fetcher),
    link: figureLink(channel),
    control: () => ({ goHome, seatPoint: () => seat }),
    size: () => 56,
    look: () => LOOK,
    watch: listener => {
      changed = listener
      return () => {
        changed = undefined
      }
    },
    clock: time.clock,
    scope: () => scope,
    note,
    changes: {
      projection: projection.watched,
      outside: {
        warn: text => void warned.push(text),
        navigate: (...args) => void navigated.push(args),
      },
      told,
    },
    issuer: ISSUER,
  })
  const settle = async () => {
    for (let round = 0; round < 6; round += 1) await new Promise(done => setTimeout(done, 0))
  }
  const line = (index: number, value: object) =>
    streams[index]!.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
  const up = (data: object) => {
    for (const listener of listeners) listener(new MessageEvent('message', { data }))
  }
  const scenes = (): Scene[] =>
    posted.flatMap(message => (message.kind === 'scene' ? [message.scene] : []))
  const hand = (
    kind: FigureHand['kind'],
    x: number,
    y: number,
    keys: Partial<{ meta: boolean; shift: boolean }> = {},
  ): boolean =>
    stay.hand({ kind, client: { x, y }, screen: { x, y }, meta: false, shift: false, ...keys })
  const modes = () => sent.filter(each => each.url.startsWith('/device/figure/mode'))
  const asked = (route: 'own' | 'window' | 'read') =>
    sent.filter(each => each.url.startsWith(`/device/figure/${route}?`))
  return {
    stay,
    note,
    sent,
    posted,
    cancelled,
    goHome,
    settle,
    line,
    up,
    scenes,
    hand,
    modes,
    asked,
    routes,
    tick: time.tick,
    pictures: () => posted.flatMap(message => (message.kind === 'picture' ? [message] : [])),
    last: () => scenes().at(-1)!,
    refuse: () => void (refuse = true),
    setSeat: (point: { x: number; y: number } | null) => void (seat = point),
    seatChanged: () => changed?.(),
    setScope: (next: string | undefined) => {
      scope = next
      note.rescope()
    },
    project: projection.make,
    warned,
    navigated,
    told,
    looks: () => posted.flatMap(message => (message.kind === 'look' ? [message.look] : [])),
    kinds: () => posted.map(message => message.kind),
    close: (index: number) => streams[index]!.close(),
    fail: (index: number) => streams[index]!.error(new Error('gone')),
    leases: () => sent.filter(each => each.url === '/device/figure/lease').length,
    fronts: () => sent.filter(each => each.url === '/device/figure/front').length,
  }
}

export type Harness = ReturnType<typeof harness>

/** Signed in, lifted on the page, the lease's first line read. */
export async function lifted(device: Harness) {
  device.stay.signedIn(true)
  await device.settle()
  device.hand('lift', 300, 200)
  await device.settle()
  device.line(device.leases() - 1, { lease: device.leases() + 6, facts: FACTS })
  await device.settle()
}

/** Out on the desk: the desk painted the first scene, and the hand let go outside the window. */
export async function onDesk(device: Harness) {
  await lifted(device)
  const first = device.last()
  device.up({ kind: 'painted', lease: first.lease, serial: first.serial })
  device.hand('drop', 1200, 300)
  return first.lease
}

/** Another app's window under the hand, as `window` answers it: in screen points, partly covered by one in front. */
export const WINDOW = {
  kind: 'other',
  id: 'w-1',
  app: 'Safari',
  title: '报错',
  bounds: { x: 1000, y: 100, width: 400, height: 300 },
  covered: [{ x: 1300, y: 80, width: 200, height: 100 }],
} as const

/** 2026-11-26 09:05:07 local time: the pictures are named 09.05.07. */
export const TAKEN_AT = new Date(2026, 10, 26, 9, 5, 7).getTime()

/** A picture of WINDOW at scale 2. */
export const shot = () => shotOf(png(800, 600), WINDOW.bounds, 2, TAKEN_AT)

/** An answer held back until the test lets it go. */
export function held<T>() {
  let settle!: (value: T) => void
  let fail!: (reason: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}

/**
 * Waits out the shell's chain of answers until `done` holds or `ms` of real time pass: the PNG work runs off the
 * event loop, so rounds alone do not bound it. A wait for something not to happen gives the whole `ms`.
 */
export async function until(device: Harness, done: () => boolean, ms = 5000) {
  const end = Date.now() + ms
  while (!done() && Date.now() < end) await device.settle()
}

/** Long enough for a read that was not dropped to have been shown: the PNG work of one picture with time to spare. */
export const DROPPED_WAIT = 400

/** Whether any scene the shell sent carries bytes: they go in their own message, never in a scene. */
export function bytesIn(value: unknown): boolean {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).some(bytesIn)
}

/**
 * The desk draws the hand, pressed on the page, on a machine that reads windows with one item in the say slot.
 * `client` points are the page's; FACTS put the content at (100, 50) on the screen.
 */
export async function carried(
  routes: Partial<Routes> = {},
  given: Parameters<typeof sayItem>[1] = {},
  slot: 'item' | 'empty' = 'item',
) {
  const place = sayPlace()
  const one = sayItem('session-ui#1', given)
  if (slot === 'item') place.put(one.item)
  const device = harness('leave', place, { read: true, ...routes })
  await lifted(device)
  const first = device.last()
  device.up({ kind: 'painted', lease: first.lease, serial: first.serial })
  return { device, one, place, lease: first.lease }
}

/** Over WINDOW with Command held (at client (1000, 300), screen (1100, 350)), and its answer taken. */
export async function framed(device: Harness, shift = false) {
  device.hand('move', 1000, 300, { meta: true, shift })
  await device.settle()
}
