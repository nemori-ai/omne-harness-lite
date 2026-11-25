import type { SayItem, SayOutcome, ShellSlots } from '@omne-harness/shell-contract'
import type { NoteFate, NoteTarget, NoteTo, SceneNote } from '../../desk/scene.ts'

export type TalkDeps = Readonly<{
  slots: ShellSlots
  scope: () => string | undefined
}>

type Note = {
  readonly scope: string | undefined
  targets: readonly NoteTarget[] | null
  to: NoteTo
  fate: NoteFate | null
  sent?: string
}

const NEW: NoteTo = { kind: 'new' }
const nothing = () => undefined

function fateOf(outcome: SayOutcome | undefined): NoteFate {
  if (outcome?.kind === 'sent') return { kind: 'accepted' }
  if (outcome?.kind === 'failed') return { kind: 'failed', reason: String(outcome.reason) }
  return { kind: 'unknown' }
}

/** The shell's side of the say slot (packages/frontend/SPEC.md, shell.say): the item is read afresh every time. */
export class Talk {
  private note: Note | null = null
  private unfollow: () => void = nothing
  private readonly unwatch: () => void

  public constructor(
    private readonly deps: TalkDeps,
    private readonly changed: () => void,
  ) {
    this.unwatch = deps.slots.subscribe('say', () => this.refresh())
  }

  public present(): boolean {
    return this.item() !== undefined
  }

  public open(): void {
    this.note = { scope: this.deps.scope(), targets: null, to: NEW, fate: null }
    this.follow()
    this.read()
  }

  public close(): void {
    this.note = null
    this.unfollow()
    this.unfollow = nothing
  }

  public scene(): SceneNote | null {
    const { note } = this
    return note === null ? null : { targets: note.targets, to: note.to, fate: note.fate }
  }

  /** One `say` per send, for the tenant the note was opened for; a throw is not known to have failed. */
  public send(words: string, to: NoteTo): void {
    const { note } = this
    const item = this.item()
    if (note === null || note.fate?.kind === 'sending' || note.targets === null || !item) return
    note.fate = { kind: 'sending' }
    this.changed()
    let said: Promise<SayOutcome>
    try {
      said = Promise.resolve(item.say(note.scope, to, words))
    } catch {
      said = Promise.resolve({ kind: 'unknown' })
    }
    void said
      .catch(() => undefined)
      .then(outcome => {
        if (outcome?.kind === 'sent') note.sent = String(outcome.key)
        note.fate = fateOf(outcome)
        if (this.note === note) this.changed()
      })
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
  }
}

function attempt<T>(read: () => T | undefined): T | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}
