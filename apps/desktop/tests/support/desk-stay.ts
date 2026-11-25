import { vi } from 'vitest'
import type {
  ItemOf,
  SayItem,
  SayOutcome,
  SayTarget,
  ShellSlots,
  SlotConflict,
  SlotName,
} from '@omne-harness/shell-contract'
import type { FigureHand } from '@omne-harness/ui-kit'
import type { Down, Look, Scene } from '../../src/page/desk/scene.ts'
import { hostFigure } from '../../src/page/shell/desk/device.ts'
import { figureLink } from '../../src/page/shell/desk/link.ts'
import { createStay } from '../../src/page/shell/desk/stay.ts'

const SCREEN = { x: 0, y: 0, width: 1440, height: 900 }
const CONTENT = { x: 100, y: 50, width: 800, height: 600 }
export const FACTS = { screen: SCREEN, content: CONTENT, visible: true }
export const LOOK: Look = { theme: 'light', size: 'medium', reduced: false }
export const SCOPE = 'tenant-a'
const encoder = new TextEncoder()

type Sent = { url: string; method: string; body: unknown }

/** One item for the say slot, with every call it was given written down. */
export function sayItem(
  id: string,
  given: Partial<{
    targets: () => readonly SayTarget[] | undefined
    current: () => string | undefined
    say: () => Promise<SayOutcome>
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

/** The shell's stay with the routes of /device/figure, the channel and the say slot stood in for. */
export function harness(device: 'leave' | 'stay' | 'unreadable' = 'leave', place?: Place) {
  const sent: Sent[] = []
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const cancelled: number[] = []
  let refuse = false
  const fetcher = async (url: string, init?: RequestInit): Promise<Response> => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    sent.push({ url, method: init?.method ?? 'GET', body })
    if (url === '/device/figure') {
      if (device === 'unreadable') throw new TypeError('no route')
      return Response.json({ leave: device === 'leave', read: false })
    }
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
  const posted: Down[] = []
  const channel = {
    postMessage: (data: Down) => void posted.push(structuredClone(data)),
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
    slots: (place ?? sayPlace()).slots,
    scope: () => scope,
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
  const hand = (kind: FigureHand['kind'], x: number, y: number): boolean =>
    stay.hand({ kind, client: { x, y }, screen: { x, y }, meta: false, shift: false })
  const modes = () => sent.filter(each => each.url.startsWith('/device/figure/mode'))
  return {
    stay,
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
    last: () => scenes().at(-1)!,
    refuse: () => void (refuse = true),
    setSeat: (point: { x: number; y: number } | null) => void (seat = point),
    seatChanged: () => changed?.(),
    setScope: (next: string | undefined) => void (scope = next),
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
