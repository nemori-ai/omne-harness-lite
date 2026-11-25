import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import {
  FIGURE_SIZE,
  SIZE_TIERS,
  type FigureControl,
  type FigureHand,
  type FigureLabelLine,
} from '@omne-harness/ui-kit'
import type { ShellSlots } from '@omne-harness/shell-contract'
import type { DeskInput, Look, Point, SceneFigure, Up } from '../../desk/scene.ts'
import { type FigureDevice, type FigureFacts } from './device.ts'
import { figureLink, type FigureLink } from './link.ts'
import { Talk, type Gift, type TalkDeps } from './talk.ts'
import { WindowLook, type Clock, type Framed, type Keys, type Seen } from './window-look.ts'
import {
  inside,
  pageDraws,
  sceneWhere,
  step,
  type Effect,
  type Facts,
  type WhereEvent,
  type Whereabouts,
} from './whereabouts.ts'

export type StayDeps = Readonly<{
  device: FigureDevice
  link: FigureLink
  control: () => FigureControl | null
  size: () => number
  look: () => Look
  watch: (changed: () => void) => () => void
  clock: Clock
}> &
  TalkDeps

export type Stay = Readonly<{
  subscribe(listener: () => void): () => void
  away(): boolean
  hand(hand: FigureHand): boolean
  recall(): void
  signedIn(yes: boolean): void
  figure(figure: SceneFigure): void
  dispose(): void
}>

export const INSIDE_LABEL: readonly FigureLabelLine[] = [{ text: '应用里' }, { text: '松手回去' }]
export const OUTSIDE_LABEL: readonly FigureLabelLine[] = [
  { text: '应用外面' },
  { text: '松手就停在这里，双击回到应用' },
]
export const LOOK_HINT: FigureLabelLine = { text: '按住 ⌘ 让它看一个窗口' }

type Lease = { number: number | null; facts: FigureFacts | null; giveUp: () => void }

const nothing = () => undefined

const UNKNOWN: Pick<Facts, 'content' | 'visible' | 'screen'> = {
  content: null,
  visible: false,
  screen: null,
}

const noting = (where: Whereabouts): boolean => where.at === 'desk' && where.note
const deskDraws = (where: Whereabouts): boolean => where.at === 'hand' && where.drawn === 'desk'
const NO_KEYS: Keys = { meta: false, shift: false }

function giftOf(seen: Seen): Gift {
  if (seen.kind === 'pictures') return seen
  return { pictures: [], told: seen, send: false }
}

class FigureStay {
  private where: Whereabouts = { at: 'seat' }
  private leave = false
  private read = false
  private signed = false
  private lease: Lease | null = null
  private serial = 0
  private sentKey = ''
  private shape: SceneFigure = { waiting: 0 }
  private labelled = false
  private pagePoint: Point = { x: 0, y: 0 }
  private deskPoint: Point = { x: 0, y: 0 }
  private deskKeys: Keys = NO_KEYS
  private rewrite = false
  private letting = false
  private gift: Gift | undefined = undefined
  private readonly sentPictures = new Set<string>()
  private unwatch: () => void = nothing
  private isAway = false
  private readonly listeners = new Set<() => void>()
  private readonly unlisten: () => void
  private readonly talk: Talk
  private readonly look: WindowLook

  public constructor(private readonly deps: StayDeps) {
    void deps.device.abilities().then(({ leave, read }) => {
      this.leave = leave
      this.read = read
    })
    this.unlisten = deps.link.listen(message => this.heard(message))
    this.talk = new Talk(
      deps,
      () => this.publish(),
      () => this.accepted(),
    )
    this.look = new WindowLook({
      device: deps.device,
      clock: deps.clock,
      can: () => deskDraws(this.where) && this.read && this.talk.present(),
      changed: () => this.publish(),
    })
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public away(): boolean {
    return this.isAway
  }

  public hand(hand: FigureHand): boolean {
    this.pagePoint = hand.client
    const at = this.toScreen(hand.client)
    const keys = { meta: hand.meta, shift: hand.shift }
    if (hand.kind === 'lift') return this.run({ kind: 'lift', on: 'page' }, true)
    if (hand.kind === 'drop') return this.letGo('page', at, keys, true)
    if (hand.kind === 'escape') return this.run({ kind: 'escape', on: 'page', at }, true)
    const lease = this.leased()
    if (lease !== null && this.where.at === 'hand' && this.where.on === 'page') {
      this.deps.link.send({ kind: 'hand', lease, at })
      this.look.hand(at, keys)
      this.publish()
    }
    return true
  }

  public recall(): void {
    this.run({ kind: 'recall' })
  }

  public signedIn(yes: boolean): void {
    if (yes === this.signed) return
    this.signed = yes
    if (!yes) this.run({ kind: 'signedOut', at: this.handPoint() })
  }

  public figure(figure: SceneFigure): void {
    this.shape = figure
    this.publish()
  }

  public dispose(): void {
    this.release()
    this.look.dispose()
    this.talk.dispose()
    this.unlisten()
    this.deps.link.close()
    this.listeners.clear()
  }

  private leased(): number | null {
    return this.lease?.number ?? null
  }

  private toScreen(client: Point): Point {
    const content = this.lease?.facts?.content
    return content === undefined ? client : { x: client.x + content.x, y: client.y + content.y }
  }

  private handPoint(): Point {
    const { where } = this
    return where.at === 'hand' && where.on === 'desk'
      ? this.deskPoint
      : this.toScreen(this.pagePoint)
  }

  private facts(): Facts {
    const seat = this.deps.control()?.seatPoint() ?? null
    const { content, visible, screen } = this.lease?.facts ?? UNKNOWN
    return {
      leave: this.leave && this.signed,
      leased: this.leased() !== null,
      seat: seat === null ? null : this.toScreen(seat),
      content,
      visible,
      screen,
      size: this.deps.size(),
      talker: this.talk.present(),
    }
  }

  /** With Command held every hand the desk draws has a label; without it only the first after the page loads. Never while the page draws. */
  private label(): readonly FigureLabelLine[] | null {
    if (!deskDraws(this.where)) return null
    const known = this.lease?.facts
    const back = known != null && known.visible && inside(known.content, this.handPoint())
    const looking = this.look.label(back)
    if (looking !== null || this.labelled) return looking
    if (back) return INSIDE_LABEL
    return this.read && this.talk.present() ? [...OUTSIDE_LABEL, LOOK_HINT] : OUTSIDE_LABEL
  }

  private letGo(on: 'page' | 'desk', at: Point, keys: Keys, fromPage = false): boolean {
    const drop = { kind: 'drop', on, at } as const
    const { where } = this
    if (!deskDraws(where) || where.at !== 'hand' || where.on !== on) return this.run(drop, fromPage)
    const framed = keys.meta ? this.look.framed() : null
    this.look.stop()
    if (framed !== null) {
      this.run({ ...drop, look: true }, fromPage)
      this.readWindow(framed, at, keys.shift)
      return true
    }
    const content = this.lease?.facts?.content
    if (!this.read || content === undefined || !this.lease?.facts?.visible || !inside(content, at))
      return this.run(drop, fromPage)
    this.letting = true
    this.look.own(at, covered => void this.run({ ...drop, covered }, fromPage))
    this.publish()
    return true
  }

  private readWindow(framed: Framed, at: Point, send: boolean): void {
    const lease = this.leased()
    const scope = this.deps.scope()
    if (lease === null) return
    const live = () => this.leased() === lease && this.deps.scope() === scope
    this.look.read(lease, framed.id, at, send, live, seen => this.seen(giftOf(seen)))
  }

  private seen(gift: Gift): void {
    if (noting(this.where)) return this.talk.give(gift)
    this.gift = gift
    this.run({ kind: 'seen' })
    this.gift = undefined
  }

  private accepted(): void {
    this.rewrite = true
    this.run({ kind: 'recall' })
  }

  /** Sends the scene when what it shows changed (the hand's moves go as small messages), or when asked again. */
  private publish(again = false): void {
    const lease = this.leased()
    if (lease === null) return
    const placed = sceneWhere(this.where, this.handPoint())
    const where =
      placed.mode === 'home' && this.rewrite ? { ...placed, rewrite: true as const } : placed
    const note = noting(this.where) ? this.talk.scene() : null
    const frame = this.look.frame()
    const label = this.label()
    const shown = { look: this.deps.look(), figure: this.shape, where, label, note, frame }
    const key = JSON.stringify({ ...shown, where: where.mode === 'hand' ? 'hand' : where })
    if (!again && key === this.sentKey) return
    this.sentKey = key
    this.serial += 1
    if (again) this.sentPictures.clear()
    this.sendPictures()
    this.deps.link.send({ kind: 'scene', scene: { lease, serial: this.serial, ...shown } })
  }

  private sendPictures(): void {
    for (const { id, bytes } of noting(this.where) ? this.talk.pictures() : []) {
      if (this.sentPictures.has(id)) continue
      this.sentPictures.add(id)
      this.deps.link.send({ kind: 'picture', id, bytes })
    }
  }

  private forget(): void {
    this.lease = null
    this.sentKey = ''
    this.sentPictures.clear()
    this.unwatch()
    this.unwatch = nothing
  }

  private release(): void {
    const given = this.lease
    this.forget()
    given?.giveUp()
  }

  private open(): void {
    if (this.lease !== null) return
    const made: Lease = { number: null, facts: null, giveUp: nothing }
    this.lease = made
    made.giveUp = this.deps.device.lease({
      opened: (number, known) => {
        made.number = number
        made.facts = known
        this.unwatch = this.deps.watch(() => this.changed())
        this.deps.device.mode(number, { hold: this.where.at === 'hand', keys: false })
        this.publish()
      },
      facts: known => {
        made.facts = known
        this.publish()
      },
      ended: () => {
        if (this.lease !== made) return
        const released = this.letting
        this.forget()
        this.run({ kind: 'ended', released })
      },
    })
  }

  private changed(): void {
    if (this.where.at === 'desk' && this.where.waiting) this.run({ kind: 'seat' })
    else this.publish()
  }

  private notify(): void {
    const away = !pageDraws(this.where)
    if (away === this.isAway) return
    this.isAway = away
    for (const listener of this.listeners) listener()
  }

  /** One step of the whereabouts and what it asks for. From the page's own hand, a stroke home is the hand's to write. */
  private run(event: WhereEvent, fromPage = false): boolean {
    const was = this.where
    const { where, effects } = step(was, event, this.facts())
    this.where = where
    if (deskDraws(was) && !deskDraws(where)) this.labelled = true
    this.moved(was, where)
    for (const effect of effects) this.perform(effect, fromPage)
    const note = noting(where)
    if (note !== noting(was)) {
      if (note) this.talk.open(this.gift)
      else this.talk.close()
    }
    this.publish()
    this.notify()
    return !fromPage || where.at !== 'seat'
  }

  private moved(was: Whereabouts, where: Whereabouts): void {
    if (where !== was) {
      this.look.cancelOwn()
      this.letting = false
    }
    if (where.at !== 'desk') this.look.cancelRead()
    if (!deskDraws(where)) this.look.stop()
    if (where.at !== 'home') this.rewrite = false
  }

  private perform(effect: Effect, fromPage: boolean): void {
    if (effect.kind === 'release') this.release()
    else if (effect.kind === 'open') this.open()
    else if (effect.kind === 'front') this.deps.device.front()
    else if (effect.kind === 'stroke') {
      if (!fromPage) this.deps.control()?.goHome()
    } else if (effect.kind === 'mode') this.mode(effect.hold, effect.keys)
  }

  private mode(hold: boolean, keys: boolean): void {
    const lease = this.leased()
    if (lease !== null) this.deps.device.mode(lease, { hold, keys })
  }

  private closeNote(): void {
    if (noting(this.where)) this.run({ kind: 'escape', on: 'desk', at: this.deskPoint })
  }

  private show(): void {
    if (!noting(this.where) || !this.talk.show()) return
    this.deps.device.front()
    this.closeNote()
  }

  private settings(): void {
    if (noting(this.where)) this.deps.device.settings()
  }

  private readonly inputs: Readonly<Record<DeskInput, () => void>> = {
    close: () => this.closeNote(),
    show: () => this.show(),
    settings: () => this.settings(),
    lift: () => void this.run({ kind: 'lift', on: 'desk' }),
    drop: () => void this.letGo('desk', this.deskPoint, this.deskKeys),
    cancel: () => void this.run({ kind: 'escape', on: 'desk', at: this.deskPoint }),
    click: () => void this.run({ kind: 'click' }),
    double: () => void this.run({ kind: 'double' }),
    move: () => {
      if (deskDraws(this.where)) this.look.hand(this.deskPoint, this.deskKeys)
      this.publish()
    },
  }

  private input(message: Extract<Up, { kind: 'input' }>): void {
    if (message.input === 'send') {
      if (noting(this.where)) this.talk.send(message.words, message.to, message.pictures ?? [])
      return
    }
    if (message.input === 'unpicture') return this.talk.unpicture(message.picture)
    if (message.at !== null) this.deskPoint = message.at
    this.deskKeys = { meta: message.meta === true, shift: message.shift === true }
    this.inputs[message.input]()
  }

  /** Handovers count for the current lease and the last scene sent; inputs only for the lease; hello for neither. */
  private heard(message: Up): void {
    if (message.kind === 'hello') return this.publish(true)
    const lease = this.leased()
    if (lease === null || message.lease !== lease) return
    if (message.kind === 'input') return this.input(message)
    if (message.serial === this.serial) this.run({ kind: message.kind })
  }
}

export const createStay = (deps: StayDeps): Stay => new FigureStay(deps)

const REDUCED = '(prefers-reduced-motion: reduce)'

const PAGE_CLOCK: Clock = {
  now: () =>
    /* wall-clock: operation-timing -- spaces the `window` questions apart; compared only with itself */ performance.now(),
  later(ms, run) {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
}

function pageLook(): Look {
  const root = document.documentElement
  const size = SIZE_TIERS.find(tier => tier === root.dataset['size']) ?? 'medium'
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia(REDUCED).matches
  return { theme: root.dataset['theme'] === 'dark' ? 'dark' : 'light', size, reduced }
}

function pageFigureSize(): number {
  const style = getComputedStyle(document.documentElement).getPropertyValue('--omne-size')
  const factor = Number.parseFloat(style)
  return FIGURE_SIZE * (Number.isFinite(factor) ? factor : 1)
}

/** Whatever on the page may bring a seat or change the look: its nodes, the root's attributes, the system's motion. */
function watchPage(changed: () => void): () => void {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'inert', 'data-width', 'data-theme', 'data-size'],
  })
  const motion = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED) : null
  motion?.addEventListener('change', changed)
  window.addEventListener('resize', changed)
  return () => {
    observer.disconnect()
    motion?.removeEventListener('change', changed)
    window.removeEventListener('resize', changed)
  }
}

type Moment = SceneFigure['moment']

const momentOf = (
  kind: NonNullable<Moment>['kind'] | undefined,
  serial: number | undefined,
): Moment => (kind === undefined || serial === undefined ? undefined : { kind, serial })

/** The shell's stay for one page: made on mount, given the login and the merged figure, dropped on unmount. */
export function useStay(
  device: FigureDevice,
  control: RefObject<FigureControl | null>,
  signedIn: boolean,
  figure: SceneFigure,
  slots: ShellSlots,
  scope: Readonly<{ get(): string | undefined }>,
): Readonly<{ away: boolean; hand: (hand: FigureHand) => boolean; recall: () => void }> {
  const [stay, setStay] = useState<Stay | null>(null)
  useEffect(() => {
    const made = createStay({
      device,
      link: figureLink(),
      control: () => control.current,
      size: pageFigureSize,
      look: pageLook,
      watch: watchPage,
      clock: PAGE_CLOCK,
      slots,
      scope: () => scope.get(),
    })
    setStay(made)
    return () => made.dispose()
  }, [device, control, slots, scope])
  useEffect(() => stay?.signedIn(signedIn), [stay, signedIn])
  const { doing, moment, waiting } = figure
  const kind = moment?.kind
  const serial = moment?.serial
  useEffect(
    () => stay?.figure({ doing, moment: momentOf(kind, serial), waiting }),
    [stay, doing, kind, serial, waiting],
  )
  const subscribe = useCallback(
    (listener: () => void) => stay?.subscribe(listener) ?? nothing,
    [stay],
  )
  const away = useSyncExternalStore(subscribe, () => stay?.away() ?? false)
  return {
    away,
    hand: hand => stay?.hand(hand) ?? false,
    recall: () => stay?.recall(),
  }
}
