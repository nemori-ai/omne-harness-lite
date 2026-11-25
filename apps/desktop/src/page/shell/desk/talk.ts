import type { SayItem, SayOutcome, SayPicture, ShellSlots } from '@omne-harness/shell-contract'
import type { NoteFate, NoteTarget, NoteTo, NoteTold, SceneNote } from '../../desk/scene.ts'
import type { LookPicture } from './window-look.ts'

export type TalkDeps = Readonly<{
  slots: ShellSlots
  scope: () => string | undefined
}>

export type TalkPicture = Readonly<{ id: string } & LookPicture>

/** What reading a window put into the note: its pictures, or why there are none; `send` says them at once. */
export type Gift = Readonly<{
  pictures: readonly LookPicture[]
  told?: NoteTold | undefined
  send: boolean
}>

type Note = {
  readonly scope: string | undefined
  targets: readonly NoteTarget[] | null
  to: NoteTo
  fate: NoteFate | null
  sent?: string
  pictures: readonly TalkPicture[]
  told: NoteTold | undefined
  knows: boolean
}

const NEW: NoteTo = { kind: 'new' }
const CANNOT: NoteTold = { kind: 'cannot-send-pictures' }
const nothing = () => undefined

function fateOf(outcome: SayOutcome | undefined): NoteFate {
  if (outcome?.kind === 'sent') return { kind: 'accepted' }
  if (outcome?.kind === 'failed') return { kind: 'failed', reason: String(outcome.reason) }
  return { kind: 'unknown' }
}

/** The shell's side of the say slot (packages/frontend/SPEC.md, shell.say): the item is read afresh every time. */
export class Talk {
  private note: Note | null = null
  private made = 0
  private unfollow: () => void = nothing
  private readonly unwatch: () => void

  /** `accepted` is called instead of `changed` when pictures said at once were accepted: the figure goes home. */
  public constructor(
    private readonly deps: TalkDeps,
    private readonly changed: () => void,
    private readonly accepted: () => void,
  ) {
    this.unwatch = deps.slots.subscribe('say', () => this.refresh())
  }

  public present(): boolean {
    return this.item() !== undefined
  }

  public open(gift?: Gift): void {
    const note: Note = {
      scope: this.deps.scope(),
      targets: null,
      to: NEW,
      fate: null,
      pictures: [],
      told: undefined,
      knows: false,
    }
    this.note = note
    this.follow()
    this.read()
    if (gift !== undefined) this.take(note, gift)
  }

  public give(gift: Gift): void {
    if (this.note === null) return
    this.take(this.note, gift)
    this.changed()
  }

  public unpicture(id: string): void {
    const { note } = this
    if (note === null || !note.pictures.some(picture => picture.id === id)) return
    note.pictures = note.pictures.filter(picture => picture.id !== id)
    this.changed()
  }

  public pictures(): readonly TalkPicture[] {
    return this.note?.pictures ?? []
  }

  public close(): void {
    this.note = null
    this.unfollow()
    this.unfollow = nothing
  }

  public scene(): SceneNote | null {
    const { note } = this
    if (note === null) return null
    const told = note.told ?? (note.pictures.length > 0 && !note.knows ? CANNOT : undefined)
    const pictures = note.pictures.map(({ id, name }) => ({ id, name }))
    return {
      targets: note.targets,
      to: note.to,
      fate: note.fate,
      ...(pictures.length > 0 ? { pictures } : {}),
      ...(told === undefined ? {} : { told }),
    }
  }

  /** One `say` per send, for the tenant the note was opened for; kept pictures only if the item takes them now; a throw is not known to have failed. */
  public send(words: string, to: NoteTo, kept: readonly string[], direct = false): void {
    const { note } = this
    const item = this.item()
    if (note === null || note.fate?.kind === 'sending' || note.targets === null || !item) return
    note.fate = { kind: 'sending' }
    this.changed()
    const handed: SayPicture[] = note.pictures
      .filter(picture => kept.includes(picture.id))
      .map(({ name, bytes }) => ({ name, bytes }))
    const said = sayOnce(item, note.scope, to, words, handed)
    const there = note.pictures.map(picture => picture.id)
    void said.catch(() => undefined).then(outcome => this.settled(note, outcome, direct, there))
  }

  /** Opens what the last accepted words went to; false when nothing was accepted. */
  public show(): boolean {
    const { note } = this
    if (note?.sent === undefined) return false
    try {
      this.item()?.show(note.scope, note.sent)
    } catch {
      // The item's own failure to show; the main window still comes to the front.
    }
    return true
  }

  public dispose(): void {
    this.close()
    this.unwatch()
  }

  private settled(
    note: Note,
    outcome: SayOutcome | undefined,
    direct: boolean,
    there: readonly string[],
  ): void {
    if (outcome?.kind === 'sent') note.sent = String(outcome.key)
    note.fate = fateOf(outcome)
    if (outcome?.kind !== 'failed')
      note.pictures = note.pictures.filter(picture => !there.includes(picture.id))
    if (this.note !== note) return
    if (direct && outcome?.kind === 'sent') this.accepted()
    else this.changed()
  }

  private take(note: Note, gift: Gift): void {
    note.pictures = gift.pictures.map(picture => ({ id: `${(this.made += 1)}`, ...picture }))
    note.told = gift.told
    if (gift.send && note.knows && note.pictures.length > 0)
      this.send(
        '',
        note.to,
        note.pictures.map(picture => picture.id),
        true,
      )
  }

  private item(): SayItem | undefined {
    const { slots } = this.deps
    return slots.conflicts('say').length > 0 ? undefined : slots.items('say')[0]
  }

  private refresh(): void {
    if (this.note === null) return
    this.follow()
    this.reread()
  }

  private follow(): void {
    this.unfollow()
    this.unfollow = this.item()?.subscribe(() => this.reread()) ?? nothing
  }

  private reread(): void {
    if (this.note === null) return
    this.read()
    this.changed()
  }

  private read(): void {
    const { note } = this
    if (note === null) return
    const item = this.item()
    const { scope } = note
    note.targets =
      attempt(() => item?.targets(scope))?.map(({ key, label }) => ({ key, label })) ?? null
    const current = attempt(() => item?.current(scope))
    note.to = current === undefined ? NEW : { kind: 'target', key: current }
    note.knows = attempt(() => item?.pictures?.(scope)) === true
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
