import { pointPicture, type FigureLabelLine } from '@omne-harness/ui-kit'
import type { Point, SceneFrame } from '../../desk/scene.ts'
import type { FigureDevice, WindowAt, WindowRead } from './device.ts'

/** At most one `window` question in this many milliseconds while the hand moves with Command held. */
export const ASK_EVERY = 100

export type Clock = Readonly<{ now(): number; later(ms: number, run: () => void): () => void }>
export type Keys = Readonly<{ meta: boolean; shift: boolean }>
export type Framed = Extract<WindowAt, { kind: 'other' }>
export type LookPicture = Readonly<{ name: string; bytes: Uint8Array<ArrayBuffer> }>

/** What reading a window gives the person: pictures (sent at once when Shift was held), or why there are none. */
export type Seen =
  | Readonly<{ kind: 'pictures'; pictures: readonly LookPicture[]; send: boolean }>
  | Readonly<{ kind: 'not-authorized' }>
  | Readonly<{ kind: 'not-seen'; reason: string }>

export type WindowLookDeps = Readonly<{
  device: Pick<FigureDevice, 'own' | 'window' | 'read'>
  clock: Clock
  can(): boolean
  changed(): void
}>

export const NOTHING_LABEL: readonly FigureLabelLine[] = [
  { text: '这里没有可看的窗口' },
  { text: '松手就停在这里' },
]
const HOME_LABEL: readonly FigureLabelLine[] = [
  { text: '这里没有可看的窗口' },
  { text: '松手回去' },
]
const INTO_NOTE: FigureLabelLine = { text: '松手放进说话笺 · 加按 ⇧ 直接发送' }
const SEND_NOW: FigureLabelLine = { text: '松手直接发送', tone: 'hint' }
export const NO_KEYS: Keys = { meta: false, shift: false }
export const UNREADABLE = '这张图读不懂'

const two = (value: number): string => String(value).padStart(2, '0')
const clockOf = (at: number): string => {
  const date = new Date(at)
  return `${two(date.getHours())}.${two(date.getMinutes())}.${two(date.getSeconds())}`
}
const nameOf = (window: Framed): string =>
  window.title === '' || window.title === window.app
    ? window.app
    : `${window.app} · ${window.title}`

async function picturesOf(read: Extract<WindowRead, { kind: 'picture' }>, at: Point) {
  const point = { x: at.x - read.bounds.x, y: at.y - read.bounds.y }
  const made = await pointPicture(read.png, point, read.scale)
  const time = clockOf(read.takenAt)
  return made.map((bytes, index) => ({
    name: `${index === 0 ? '窗口' : '近看'} ${time}.png`,
    bytes: new Uint8Array(bytes),
  }))
}

async function seenOf(read: WindowRead, at: Point, send: boolean): Promise<Seen | null> {
  if (read.kind === 'gone') return null
  if (read.kind === 'not-authorized') return { kind: 'not-authorized' }
  if (read.kind === 'failed') return { kind: 'not-seen', reason: read.reason }
  try {
    return { kind: 'pictures', pictures: await picturesOf(read, at), send }
  } catch {
    return { kind: 'not-seen', reason: UNREADABLE }
  }
}

/** Looking at other apps' windows (SPEC 桌面层, 读一个窗口): asks only while Command and `can()` hold (DT-56); drops late answers. */
export class WindowLook {
  private keys: Keys = NO_KEYS
  private at: Point = { x: 0, y: 0 }
  private under: WindowAt | null = null
  private asked = 0
  private lastAsk = Number.NEGATIVE_INFINITY
  private waiting: (() => void) | null = null
  private reading = 0
  private owning = 0

  public constructor(private readonly deps: WindowLookDeps) {}

  public hand(at: Point, keys: Keys): void {
    this.at = at
    this.keys = keys
    if (!this.looking()) return this.stop()
    this.ask()
  }

  public stop(): void {
    this.keys = NO_KEYS
    this.under = null
    this.asked += 1
    this.waiting?.()
    this.waiting = null
  }

  public framed(): Framed | null {
    return this.looking() && this.under?.kind === 'other' ? this.under : null
  }

  public frame(): SceneFrame | null {
    const framed = this.framed()
    return framed === null
      ? null
      : { rect: framed.bounds, covered: framed.covered, closed: this.keys.shift }
  }

  public label(home: boolean): readonly FigureLabelLine[] | null {
    if (!this.looking()) return null
    const framed = this.framed()
    if (framed === null) return home && this.under?.kind === 'own' ? HOME_LABEL : NOTHING_LABEL
    return [{ text: nameOf(framed) }, this.keys.shift ? SEND_NOW : INTO_NOTE]
  }

  /** Asks `own` once for a drop; `take` gets whether the point is covered, unless the drop was given up meanwhile. */
  public own(at: Point, take: (covered: boolean) => void): void {
    const token = (this.owning += 1)
    void this.deps.device.own(at).then(own => {
      if (token === this.owning) take(own === false)
    })
  }

  public cancelOwn(): void {
    this.owning += 1
  }

  /** Reads the window framed at letting go; `take` gets what to show unless it came late or `live()` no longer holds. */
  public read(
    lease: number,
    window: string,
    at: Point,
    send: boolean,
    live: () => boolean,
    take: (seen: Seen) => void,
  ): void {
    const token = (this.reading += 1)
    const current = () => token === this.reading && live()
    void this.deps.device
      .read(lease, window)
      .then(read => (current() ? seenOf(read, at, send) : null))
      .then(seen => {
        if (seen !== null && current()) take(seen)
      })
  }

  public cancelRead(): void {
    this.reading += 1
  }

  public dispose(): void {
    this.stop()
    this.cancelOwn()
    this.cancelRead()
  }

  private looking(): boolean {
    return this.keys.meta && this.deps.can()
  }

  private ask(): void {
    const wait = this.lastAsk + ASK_EVERY - this.deps.clock.now()
    if (wait <= 0) return this.askNow()
    this.waiting ??= this.deps.clock.later(wait, () => {
      this.waiting = null
      if (this.looking()) this.askNow()
    })
  }

  private askNow(): void {
    this.lastAsk = this.deps.clock.now()
    const serial = (this.asked += 1)
    void this.deps.device.window(this.at).then(answer => {
      if (serial !== this.asked || !this.looking()) return
      this.under = answer
      this.deps.changed()
    })
  }
}
