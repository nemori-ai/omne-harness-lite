import type { SayItem, SayOutcome, SayPicture, ShellSlots } from '@omne-harness/shell-contract'
import type { NoteFate, NoteTarget, NoteTo, NoteTold, SceneNote } from '../desk/scene.ts'
import type { LookPicture } from './desk/window-look.ts'

export type NoteDeps = Readonly<{
  slots: ShellSlots
  scope: () => string | undefined
}>

export type NotePicture = Readonly<{ id: string } & LookPicture>

/** What reading a window put into the note: its pictures, or why there are none; `send` says them at once. */
export type Gift = Readonly<{
  pictures: readonly LookPicture[]
  told?: NoteTold | undefined
  send: boolean
}>

/** The desk side, as the stay gives it: whether the whereabouts has the note open out there, a step that closes it, and the figure going home once pictures said at once were accepted. */
export type NoteDesk = Readonly<{ open(): boolean; close(): void; accepted(): void }>

export type NoteSpot = Readonly<{ id: string; element: Element }>

export type NoteView = Readonly<{
  present: boolean
  window: NoteSpot | null
  note: SceneNote
  pictures: readonly NotePicture[]
}>

export type ShellNote = Readonly<{
  subscribe(listener: () => void): () => void
  view(): NoteView
  present(): boolean
  desk(side: NoteDesk): () => void
  deskOpened(gift?: Gift): void
  deskClosed(): void
  toggle(id: string, element: Element): void
  close(id?: string): void
  write(words: string, chosen: NoteTo | undefined): void
  unsent(words: string, chosen: NoteTo | undefined, edit: number): void
  give(gift: Gift): void
  unpicture(id: string): void
  send(words: string, to: NoteTo, kept: readonly string[]): void
  show(): boolean
  rescope(): void
  scene(): SceneNote
  pictures(): readonly NotePicture[]
  dispose(): void
}>

type Read = Readonly<{
  targets: readonly NoteTarget[] | null
  current: string | undefined
  knows: boolean
}>

type Draft = {
  words: string
  chosen: NoteTo | undefined
  fate: NoteFate | null
  pictures: readonly NotePicture[]
  told: NoteTold | undefined
  sent: string | undefined
  read: Read | null
}

const NEW: NoteTo = { kind: 'new' }
const CANNOT: NoteTold = { kind: 'cannot-send-pictures' }
const nothing = () => undefined

const blank = (): Draft => ({
  words: '',
  chosen: undefined,
  fate: null,
  pictures: [],
  told: undefined,
  sent: undefined,
  read: null,
})

function fateOf(outcome: SayOutcome | undefined): NoteFate {
  if (outcome?.kind === 'sent') return { kind: 'accepted' }
  if (outcome?.kind === 'failed') return { kind: 'failed', reason: String(outcome.reason) }
  return { kind: 'unknown' }
}

function defaultTo({ chosen, read }: Draft): NoteTo {
  const known = (to: NoteTo) => to.kind === 'new' || read?.targets?.some(t => t.key === to.key)
  if (chosen !== undefined && known(chosen)) return chosen
  return read?.current === undefined ? NEW : { kind: 'target', key: read.current }
}

/** The shell's one say note (apps/desktop/SPEC.md, 说话): one per shell, read the same in the window and on the desk; whether it is open on the desk is the whereabouts' alone. */
class Note implements ShellNote {
  private tenant: string | undefined
  private draft: Draft = blank()
  private edit = 0
  private spot: NoteSpot | null = null
  private side: NoteDesk | null = null
  private made = 0
  private seen: NoteView | null = null
  private unfollow: () => void = nothing
  private readonly unwatch: () => void
  private readonly listeners = new Set<() => void>()

  public constructor(private readonly deps: NoteDeps) {
    this.tenant = deps.scope()
    this.unwatch = deps.slots.subscribe('say', () => this.slotChanged())
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public view(): NoteView {
    this.seen ??= {
      present: this.present(),
      window: this.spot,
      note: this.scene(),
      pictures: this.draft.pictures,
    }
    return this.seen
  }

  public present(): boolean {
    return this.item() !== undefined
  }

  public desk(side: NoteDesk): () => void {
    this.side = side
    return () => {
      if (this.side !== side) return
      this.side = null
      this.shut()
    }
  }

  public deskOpened(gift?: Gift): void {
    this.spot = null
    this.opened()
    if (gift !== undefined) this.take(gift)
    this.changed()
  }

  public deskClosed(): void {
    this.shut()
  }

  public toggle(id: string, element: Element): void {
    if (!this.present()) return
    if (this.spot?.id === id) return this.close(id)
    if (this.side?.open() === true) this.side.close()
    this.spot = { id, element }
    this.opened()
    this.changed()
  }

  public close(id?: string): void {
    if (this.spot === null || (id !== undefined && this.spot.id !== id)) return
    this.spot = null
    this.shut()
    this.changed()
  }

  public write(words: string, chosen: NoteTo | undefined): void {
    const { draft } = this
    draft.words = words
    draft.chosen = chosen
    if (draft.fate?.kind === 'failed' || draft.fate?.kind === 'unknown') draft.fate = null
    this.changed()
  }

  public unsent(words: string, chosen: NoteTo | undefined, edit: number): void {
    if (edit === this.edit) this.write(words, chosen)
  }

  public give(gift: Gift): void {
    this.take(gift)
    this.changed()
  }

  public unpicture(id: string): void {
    const { draft } = this
    if (!draft.pictures.some(picture => picture.id === id)) return
    draft.pictures = draft.pictures.filter(picture => picture.id !== id)
    this.changed()
  }

  public send(words: string, to: NoteTo, kept: readonly string[]): void {
    this.say(words, to, kept, false)
  }

  /** Opens what the last accepted words went to; false when nothing was accepted. */
  public show(): boolean {
    const { sent } = this.draft
    if (sent === undefined) return false
    try {
      this.item()?.show(this.tenant, sent)
    } catch {
      // The item's own failure to show; whoever asked still goes on as if shown.
    }
    return true
  }

  public rescope(): void {
    const next = this.deps.scope()
    if (next === this.tenant) return
    this.tenant = next
    this.draft = blank()
    this.edit += 1
    this.spot = null
    if (this.side?.open() === true) this.read()
    else this.shut()
    this.changed()
  }

  public scene(): SceneNote {
    const { draft } = this
    const knows = draft.read?.knows === true
    const told = draft.told ?? (draft.pictures.length > 0 && !knows ? CANNOT : undefined)
    const pictures = draft.pictures.map(({ id, name }) => ({ id, name }))
    return {
      targets: draft.read?.targets ?? null,
      to: defaultTo(draft),
      fate: draft.fate,
      ...(pictures.length > 0 ? { pictures } : {}),
      ...(told === undefined ? {} : { told }),
      words: draft.words,
      ...(draft.chosen === undefined ? {} : { chosen: draft.chosen }),
      edit: this.edit,
    }
  }

  public pictures(): readonly NotePicture[] {
    return this.draft.pictures
  }

  public dispose(): void {
    this.unfollow()
    this.unfollow = nothing
    this.unwatch()
    this.listeners.clear()
  }

  private say(words: string, to: NoteTo, kept: readonly string[], direct: boolean): void {
    const { draft } = this
    const item = this.item()
    if (draft.fate?.kind === 'sending' || !draft.read?.targets || !item) return
    if (!direct) draft.words = words
    draft.fate = { kind: 'sending' }
    this.changed()
    const handed: SayPicture[] = draft.pictures
      .filter(picture => kept.includes(picture.id))
      .map(({ name, bytes }) => ({ name, bytes }))
    const said = sayOnce(item, this.tenant, to, words, handed)
    const there = draft.pictures.map(picture => picture.id)
    void said.catch(() => undefined).then(outcome => this.settled(draft, outcome, direct, there))
  }

  private settled(
    draft: Draft,
    outcome: SayOutcome | undefined,
    direct: boolean,
    there: readonly string[],
  ): void {
    if (this.draft !== draft) return
    draft.fate = fateOf(outcome)
    if (outcome?.kind !== 'failed')
      draft.pictures = draft.pictures.filter(picture => !there.includes(picture.id))
    if (outcome?.kind === 'sent') this.accepted(draft, outcome.key, direct)
    this.changed()
  }

  /** Words said at once carry no words of the person's: theirs stay, and the figure goes home. */
  private accepted(draft: Draft, key: string, direct: boolean): void {
    draft.sent = String(key)
    if (direct) return this.side?.accepted()
    draft.words = ''
    draft.chosen = undefined
    this.edit += 1
  }

  private take(gift: Gift): void {
    const { draft } = this
    draft.pictures = gift.pictures.map(picture => ({ id: `${(this.made += 1)}`, ...picture }))
    draft.told = gift.told
    if (gift.send && draft.read?.knows === true && draft.pictures.length > 0) {
      const all = draft.pictures.map(picture => picture.id)
      this.say('', defaultTo(draft), all, true)
    }
  }

  private item(): SayItem | undefined {
    const { slots } = this.deps
    return slots.conflicts('say').length > 0 ? undefined : slots.items('say')[0]
  }

  private isOpen(): boolean {
    return this.spot !== null || this.side?.open() === true
  }

  private opened(): void {
    this.follow()
    this.read()
  }

  private shut(): void {
    if (this.isOpen()) return
    this.unfollow()
    this.unfollow = nothing
  }

  private slotChanged(): void {
    if (!this.present()) {
      this.spot = null
      if (this.side?.open() === true) this.side.close()
    }
    if (this.isOpen()) this.opened()
    else this.shut()
    this.changed()
  }

  private follow(): void {
    this.unfollow()
    this.unfollow = this.item()?.subscribe(() => this.reread()) ?? nothing
  }

  private reread(): void {
    this.read()
    this.changed()
  }

  private read(): void {
    const item = this.item()
    const scope = this.tenant
    this.draft.read = {
      targets:
        attempt(() => item?.targets(scope))?.map(({ key, label }) => ({ key, label })) ?? null,
      current: attempt(() => item?.current(scope)),
      knows: attempt(() => item?.pictures?.(scope)) === true,
    }
  }

  private changed(): void {
    this.seen = null
    for (const listener of this.listeners) listener()
  }
}

function sayOnce(
  item: SayItem,
  scope: string | undefined,
  to: NoteTo,
  words: string,
  handed: readonly SayPicture[],
): Promise<SayOutcome> {
  const knows = attempt(() => item.pictures?.(scope)) === true
  try {
    return Promise.resolve(
      knows && handed.length > 0 ? item.say(scope, to, words, handed) : item.say(scope, to, words),
    )
  } catch {
    return Promise.resolve({ kind: 'unknown' })
  }
}

function attempt<T>(read: () => T | undefined): T | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}

export const createShellNote = (deps: NoteDeps): ShellNote => new Note(deps)
