import type { SceneNote } from '../../desk/scene.ts'
import type { Clock } from './window-look.ts'

const REPLY_EVERY = 100

type Shown = Readonly<Record<string, unknown> & { note: SceneNote | null }>

/** Whether a scene goes now: one that differs from the last only by a reply still coming goes at most every 100ms, the rest at once. */
export class ReplyPace {
  private key = ''
  private replied = ''
  private at = Number.NEGATIVE_INFINITY
  private later: (() => void) | null = null

  public constructor(
    private readonly clock: Clock,
    private readonly due: () => void,
  ) {}

  public goes(shown: Shown, again: boolean): boolean {
    const { note } = shown
    const key = JSON.stringify({
      ...shown,
      note: note === null ? null : { ...note, reply: undefined },
    })
    const replied = JSON.stringify(note?.reply ?? null)
    if (!again && key === this.key && (replied === this.replied || this.waits(note))) return false
    this.stop()
    if (replied !== this.replied) this.at = this.clock.now()
    this.key = key
    this.replied = replied
    return true
  }

  public reset(): void {
    this.key = ''
    this.replied = ''
    this.stop()
  }

  private waits(note: SceneNote | null): boolean {
    const wait = this.at + REPLY_EVERY - this.clock.now()
    if (note?.reply?.state !== 'coming' || wait <= 0) return false
    this.later ??= this.clock.later(wait, () => {
      this.later = null
      this.due()
    })
    return true
  }

  private stop(): void {
    this.later?.()
    this.later = null
  }
}
