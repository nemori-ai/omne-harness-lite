import type {
  SayItem,
  SayOutcome,
  SayPhrase,
  SayPicture,
  SayReply,
  ShellSlots,
} from '@omne-harness/shell-contract'
import type { NoteFate, NoteReply, NoteTarget, NoteTo, NoteTold, SceneNote } from '../desk/scene.ts'
import type { LookPicture } from './desk/window-look.ts'

export type PhraseFeed = Readonly<{
  phrases(): readonly SayPhrase[]
  watch(listener: () => void): () => void
}>

export type NoteDeps = Readonly<{
  slots: ShellSlots
  scope: () => string | undefined
  phrases: PhraseFeed
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
  phrase(key: string): void
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
  reply: NoteReply | undefined
}

type Saying = 'send' | 'phrase' | 'direct'
type Replying = { readonly item: SayItem; stop: () => void; seen: NoteReply }

const NEW: NoteTo = { kind: 'new' }
const CANNOT: NoteTold = { kind: 'cannot-send-pictures' }
const nothing = () => undefined
const REPLY_KEPT = 4000
const REPLY_STATES: readonly unknown[] = ['coming', 'ended', 'unknown']

const blank = (): Draft => ({
  words: '',
  chosen: undefined,
  fate: null,
  pictures: [],
  told: undefined,
  sent: undefined,
  read: null,
  reply: undefined,
})

function kept(given: SayReply): NoteReply {
  const text = String(given.text)
  const state = REPLY_STATES.includes(given.state) ? given.state : 'unknown'
  const chars = Array.from(text)
  if (chars.length <= REPLY_KEPT) return { text, state }
  return { text: chars.slice(0, REPLY_KEPT).join(''), state, more: true }
}

const replied = (reply: NoteReply | undefined) => (reply === undefined ? {} : { reply })

function phrased(phrases: readonly SayPhrase[]) {
  const shown = phrases.map(({ key, label }) => ({ key, label }))
  return shown.length > 0 ? { phrases: shown } : {}
}

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
  private replying: Replying | null = null
  private phraseList: readonly SayPhrase[] = []
  private readonly unwatch: () => void
  private readonly unphrase: () => void
  private readonly listeners = new Set<() => void>()

  public constructor(private readonly deps: NoteDeps) {
    this.tenant = deps.scope()
    this.unwatch = deps.slots.subscribe('say', () => this.slotChanged())
    this.unphrase = deps.phrases.watch(() => this.phrasesChanged())
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
    this.say(words, to, kept, 'send')
  }

  public phrase(key: string): void {
    const found = this.shownPhrases().find(phrase => phrase.key === key)
    if (found === undefined) return
    const { draft } = this
    const words = draft.words.trim() === '' ? found.words : `${found.words}\n${draft.words}`
    const all = draft.pictures.map(picture => picture.id)
    this.say(words, defaultTo(draft), all, 'phrase')
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
    this.stopReply()
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
      ...replied(draft.reply),
      ...phrased(this.shownPhrases()),
    }
  }

  public pictures(): readonly NotePicture[] {
    return this.draft.pictures
  }

  public dispose(): void {
    this.unfollow()
    this.unfollow = nothing
    this.stopReply()
    this.unphrase()
    this.unwatch()
    this.listeners.clear()
  }

  private say(words: string, to: NoteTo, kept: readonly string[], saying: Saying): void {
    const { draft } = this
    const item = this.item()
    if (draft.fate?.kind === 'sending' || !draft.read?.targets || !item) return
    if (saying === 'send') draft.words = words
    draft.fate = { kind: 'sending' }
    this.stopReply()
    draft.reply = undefined
    this.changed()
    const handed: SayPicture[] = draft.pictures
      .filter(picture => kept.includes(picture.id))
      .map(({ name, bytes }) => ({ name, bytes }))
    const said = sayOnce(item, this.tenant, to, words, handed)
    const there = draft.pictures.map(picture => picture.id)
    const settle = (outcome: SayOutcome | undefined) =>
      this.settled(draft, outcome, { saying, there, item })
    void said.catch(() => undefined).then(settle)
  }

  private settled(
    draft: Draft,
    outcome: SayOutcome | undefined,
    sent: Readonly<{ saying: Saying; there: readonly string[]; item: SayItem }>,
  ): void {
    if (this.draft !== draft) return
    draft.fate = fateOf(outcome)
    if (outcome?.kind !== 'failed')
      draft.pictures = draft.pictures.filter(picture => !sent.there.includes(picture.id))
    if (outcome?.kind === 'sent') this.accepted(draft, outcome, sent.saying, sent.item)
    this.changed()
  }

  /** Words said at once carry no words of the person's: theirs stay, and the figure goes home. */
  private accepted(
    draft: Draft,
    outcome: Extract<SayOutcome, { kind: 'sent' }>,
    saying: Saying,
    item: SayItem,
  ): void {
    draft.sent = String(outcome.key)
    if (saying !== 'direct') {
      draft.words = ''
      draft.chosen = undefined
      this.edit += 1
    }
    if (outcome.said !== undefined && this.item() === item)
      this.followReply(draft, item, outcome.said)
    if (saying === 'direct') this.side?.accepted()
  }

  private followReply(draft: Draft, item: SayItem, said: string): void {
    if (item.reply === undefined) return
    const replying: Replying = { item, stop: nothing, seen: { text: '', state: 'coming' } }
    this.replying = replying
    draft.reply = replying.seen
    try {
      replying.stop = item.reply(this.tenant, String(said), given => this.heard(replying, given))
    } catch {
      this.replying = null
      draft.reply = undefined
      return
    }
    if (this.replying !== replying) attempt(replying.stop)
  }

  private heard(replying: Replying, given: SayReply): void {
    if (this.replying !== replying) return
    replying.seen = kept(given)
    this.draft.reply = replying.seen
    if (replying.seen.state !== 'coming') this.stopReply()
    this.changed()
  }

  private stopReply(): void {
    const replying = this.replying
    this.replying = null
    if (replying !== null) attempt(replying.stop)
  }

  private replyLost(): void {
    const { replying } = this
    if (replying === null || this.item() === replying.item) return
    this.stopReply()
    this.draft.reply = { ...replying.seen, state: 'unknown' }
  }

  private shownPhrases(): readonly SayPhrase[] {
    const { draft } = this
    return draft.pictures.length > 0 && draft.read?.knows === true ? this.phraseList : []
  }

  private phrasesChanged(): void {
    if (!this.isOpen()) return
    const was = this.phraseList
    this.readPhrases()
    if (this.phraseList !== was) this.changed()
  }

  private readPhrases(): void {
    this.phraseList = attempt(() => this.deps.phrases.phrases()) ?? []
  }

  private take(gift: Gift): void {
    const { draft } = this
    draft.pictures = gift.pictures.map(picture => ({ id: `${(this.made += 1)}`, ...picture }))
    draft.told = gift.told
    if (gift.send && draft.read?.knows === true && draft.pictures.length > 0) {
      const all = draft.pictures.map(picture => picture.id)
      this.say('', defaultTo(draft), all, 'direct')
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
    this.readPhrases()
  }

  private shut(): void {
    if (this.isOpen()) return
    this.unfollow()
    this.unfollow = nothing
  }

  private slotChanged(): void {
    this.replyLost()
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
