import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import {
  FIGURE_SIZE,
  SIZE_TIERS,
  type FigureControl,
  type FigureHand,
  type FigureLabelLine,
} from '@omne-harness/ui-kit'
import type { ShellSlots } from '@omne-harness/shell-contract'
import type { Look, Point, SceneFigure, Up } from '../../desk/scene.ts'
import { type FigureDevice, type FigureFacts } from './device.ts'
import { figureLink, type FigureLink } from './link.ts'
import { Talk, type TalkDeps } from './talk.ts'
import {
  inside,
  pageDraws,
  sceneWhere,
  step,
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

type Lease = { number: number | null; facts: FigureFacts | null; giveUp: () => void }

const nothing = () => undefined

const noting = (where: Whereabouts): boolean => where.at === 'desk' && where.note

class FigureStay {
  private where: Whereabouts = { at: 'seat' }
  private leave = false
  private signed = false
  private lease: Lease | null = null
  private serial = 0
  private sentKey = ''
  private shape: SceneFigure = { waiting: 0 }
  private labelled = false
  private pagePoint: Point = { x: 0, y: 0 }
  private deskPoint: Point = { x: 0, y: 0 }
  private unwatch: () => void = nothing
  private isAway = false
  private readonly listeners = new Set<() => void>()
  private readonly unlisten: () => void
  private readonly talk: Talk

  public constructor(private readonly deps: StayDeps) {
    void deps.device.leave().then(yes => void (this.leave = yes))
    this.unlisten = deps.link.listen(message => this.heard(message))
    this.talk = new Talk(deps, () => this.publish())
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
    if (hand.kind === 'lift') return this.run({ kind: 'lift', on: 'page' }, true)
    if (hand.kind === 'drop' || hand.kind === 'escape')
      return this.run({ kind: hand.kind, on: 'page', at }, true)
    const lease = this.leased()
    if (lease !== null && this.where.at === 'hand' && this.where.on === 'page') {
      this.deps.link.send({ kind: 'hand', lease, at })
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
    const known = this.lease?.facts ?? null
    return {
      leave: this.leave && this.signed,
      leased: this.leased() !== null,
      seat: seat === null ? null : this.toScreen(seat),
      content: known?.content ?? null,
      visible: known?.visible ?? false,
      screen: known?.screen ?? null,
      size: this.deps.size(),
      talker: this.talk.present(),
    }
  }

  /** The label goes with the first hand the desk draws after the page loads; never while the page draws the hand. */
  private label(): readonly FigureLabelLine[] | null {
    const { where } = this
    if (where.at !== 'hand' || where.drawn !== 'desk' || this.labelled) return null
    const known = this.lease?.facts
    const back = known != null && known.visible && inside(known.content, this.handPoint())
    return back ? INSIDE_LABEL : OUTSIDE_LABEL
  }

  /** Sends the scene when what it shows changed (the hand's moves go as small messages), or when asked again. */
  private publish(again = false): void {
    const lease = this.leased()
    if (lease === null) return
    const where = sceneWhere(this.where, this.handPoint())
    const note = noting(this.where) ? this.talk.scene() : null
    const shown = { look: this.deps.look(), figure: this.shape, where, label: this.label(), note }
    const key = JSON.stringify({ ...shown, where: where.mode === 'hand' ? 'hand' : where })
    if (!again && key === this.sentKey) return
    this.sentKey = key
    this.serial += 1
    this.deps.link.send({ kind: 'scene', scene: { lease, serial: this.serial, ...shown } })
  }

  private forget(): void {
    this.lease = null
    this.sentKey = ''
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
        this.forget()
        this.run({ kind: 'ended' })
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
    const leftTheDesk = !(where.at === 'hand' && where.drawn === 'desk')
    if (was.at === 'hand' && was.drawn === 'desk' && leftTheDesk) this.labelled = true
    for (const effect of effects)
      if (effect.kind === 'release') this.release()
      else if (effect.kind === 'open') this.open()
      else if (effect.kind === 'front') this.deps.device.front()
      else if (effect.kind === 'stroke' && !fromPage) this.deps.control()?.goHome()
      else if (effect.kind === 'mode') {
        const lease = this.leased()
        if (lease !== null) this.deps.device.mode(lease, { hold: effect.hold, keys: effect.keys })
      }
    if (noting(where) && !noting(was)) this.talk.open()
    else if (!noting(where) && noting(was)) this.talk.close()
    this.publish()
    this.notify()
    return !fromPage || where.at !== 'seat'
  }

  private closeNote(): void {
    if (noting(this.where)) this.run({ kind: 'escape', on: 'desk', at: this.deskPoint })
  }

  private input(message: Extract<Up, { kind: 'input' }>): void {
    if (message.input === 'send') {
      if (noting(this.where)) this.talk.send(message.words, message.to)
      return
    }
    const { input: kind, at } = message
    if (at !== null) this.deskPoint = at
    if (kind === 'close') this.closeNote()
    else if (kind === 'show') {
      if (noting(this.where) && this.talk.show()) {
        this.deps.device.front()
        this.closeNote()
      }
    } else if (kind === 'lift') this.run({ kind: 'lift', on: 'desk' })
    else if (kind === 'drop' || kind === 'cancel')
      this.run({ kind: kind === 'drop' ? 'drop' : 'escape', on: 'desk', at: this.deskPoint })
    else if (kind === 'click' || kind === 'double') this.run({ kind })
    else this.publish()
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
  useEffect(() => {
    const said = kind === undefined || serial === undefined ? undefined : { kind, serial }
    stay?.figure({ doing, moment: said, waiting })
  }, [stay, doing, kind, serial, waiting])
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
