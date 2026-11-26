import type { FigureControl, FigureHand, FigureLabelLine } from '@omne-harness/ui-kit'
import type { DeskInput, Look, Point, SceneFigure, SceneWhere, Up } from '../../desk/scene.ts'
import type { FigureDevice, FigureFacts } from './device.ts'
import { LetGo } from './let-go.ts'
import { DeskPictures } from './pictures.ts'
import type { FigureLink } from './link.ts'
import { createLookPublisher, type LookFeed, type LookPublisher } from './look.ts'
import { firstLabel, insideApp } from './sign.ts'
import { Talk, type Gift, type TalkDeps } from './talk.ts'
import { stayHook } from './use-stay.ts'
import { NO_KEYS, WindowLook, type Clock, type Keys } from './window-look.ts'
import {
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
  changes: LookFeed
  issuer?: string
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

type Lease = { number: number | null; facts: FigureFacts | null; giveUp: () => void }

const nothing = () => undefined

const UNKNOWN: Pick<Facts, 'content' | 'visible' | 'screen'> = {
  content: null,
  visible: false,
  screen: null,
}

const noting = (where: Whereabouts): boolean => where.at === 'desk' && where.note
const deskDraws = (where: Whereabouts): boolean => where.at === 'hand' && where.drawn === 'desk'

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
  private readonly pictures: DeskPictures
  private unwatch: () => void = nothing
  private isAway = false
  private readonly listeners = new Set<() => void>()
  private readonly unlisten: () => void
  private readonly talk: Talk
  private readonly look: WindowLook
  private readonly letGo: LetGo
  private readonly changes: LookPublisher

  public constructor(private readonly deps: StayDeps) {
    void deps.device.abilities().then(({ leave, read }) => {
      this.leave = leave
      this.read = read
    })
    this.pictures = new DeskPictures(deps.link)
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
    this.letGo = new LetGo({
      look: this.look,
      where: () => this.where,
      read: () => this.read,
      facts: () => this.lease?.facts,
      lease: () => this.leased(),
      scope: () => deps.scope(),
      run: (event, fromPage) => this.run(event, fromPage),
      seen: gift => this.seen(gift),
      publish: () => this.publish(),
    })
    this.changes = createLookPublisher({
      ...deps.changes,
      scope: () => deps.scope(),
      send: look => deps.link.send({ kind: 'look', look }),
      changed: () => this.publish(),
      ...(deps.issuer === undefined ? {} : { issuer: deps.issuer }),
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
    if (hand.kind === 'drop') return this.letGo.drop('page', at, keys, true)
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
    this.changes.dispose()
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
    const back = insideApp(this.lease?.facts, this.handPoint())
    const looking = this.look.label(back)
    if (looking !== null || this.labelled) return looking
    return firstLabel(back, this.read && this.talk.present())
  }

  /** What reading a window gave: into the open note, or a note opened with it. */
  private seen(gift: Gift): void {
    if (noting(this.where)) return this.talk.give(gift)
    this.run({ kind: 'seen' }, false, gift)
  }

  private accepted(): void {
    this.rewrite = true
    this.run({ kind: 'recall' })
  }

  private placed(): SceneWhere {
    const placed = sceneWhere(this.where, this.handPoint())
    return placed.mode === 'home' && this.rewrite ? { ...placed, rewrite: true } : placed
  }

  /** Sends the scene when what it shows changed (the hand's moves go as small messages), or when asked again. */
  private publish(again = false): void {
    const lease = this.leased()
    if (lease === null) return
    const where = this.placed()
    const note = noting(this.where) ? this.talk.scene() : null
    const frame = this.look.frame()
    const label = this.label()
    const look = { ...this.deps.look(), ...this.changes.stamp() }
    const shown = { look, figure: this.shape, where, label, note, frame }
    const key = JSON.stringify({ ...shown, where: where.mode === 'hand' ? 'hand' : where })
    if (!again && key === this.sentKey) return
    this.sentKey = key
    this.serial += 1
    if (again) this.pictures.forget()
    this.pictures.send(noting(this.where) ? this.talk.pictures() : [])
    this.deps.link.send({ kind: 'scene', scene: { lease, serial: this.serial, ...shown } })
  }

  private forget(): void {
    this.changes.ended()
    this.lease = null
    this.sentKey = ''
    this.pictures.forget()
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
        this.changes.send()
        this.publish()
      },
      facts: known => {
        made.facts = known
        this.publish()
      },
      ended: () => {
        if (this.lease !== made) return
        const released = this.letGo.waiting()
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
  private run(event: WhereEvent, fromPage = false, gift?: Gift): boolean {
    const was = this.where
    const { where, effects } = step(was, event, this.facts())
    this.where = where
    if (deskDraws(was) && !deskDraws(where)) this.labelled = true
    this.moved(was, where)
    for (const effect of effects) this.perform(effect, fromPage)
    const note = noting(where)
    if (note !== noting(was)) {
      if (note) this.talk.open(gift)
      else this.talk.close()
    }
    this.publish()
    this.notify()
    return !fromPage || where.at !== 'seat'
  }

  private moved(was: Whereabouts, where: Whereabouts): void {
    if (where !== was) this.letGo.moved()
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
    drop: () => void this.letGo.drop('desk', this.deskPoint, this.deskKeys, false),
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

  /** Handovers count for the current lease and the last scene sent; inputs only for the lease; hello and what a drawing asks for neither. */
  private heard(message: Up): void {
    if (message.kind === 'hello') {
      this.changes.send()
      return this.publish(true)
    }
    if (message.kind === 'undrawn' || message.kind === 'navigate' || message.kind === 'toast')
      return this.changes.heard(message)
    const lease = this.leased()
    if (lease === null || message.lease !== lease) return
    if (message.kind === 'input') return this.input(message)
    if (message.serial === this.serial) this.run({ kind: message.kind })
  }
}

export const createStay = (deps: StayDeps): Stay => new FigureStay(deps)

/** The shell's stay for one page (src/page/shell/shell.tsx). */
export const useStay = stayHook(createStay)
