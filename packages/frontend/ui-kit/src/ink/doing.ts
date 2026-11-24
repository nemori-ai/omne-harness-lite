import { type Doing, type FigureMoment } from './body.ts'
import { inkNow } from './clock.ts'

export const DWELL = 900

export const SETTLE = 150

export const LAG = 1600

export interface DoingBody {
  perform(next: Doing | null): void
  moment(kind: FigureMoment['kind']): void
  strokeLeft?(): number
}

const HELD: ReadonlySet<Doing> = new Set<Doing>(['looking', 'writing'])

const GROUND: ReadonlySet<Doing> = new Set<Doing>(['thinking', 'background'])

export class DoingPolicy {
  private shown: Doing | null = null
  private since = -Infinity
  private touched = -Infinity
  private wanted: Doing | null = null
  private wantedSince = -Infinity
  private owed: { readonly doing: Doing; readonly at: number } | null = null
  private due: number | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly body: DoingBody
  private readonly clock: () => number
  private told: number | null
  public constructor(body: DoingBody, clock: () => number = inkNow, told: number | null = null) {
    this.body = body
    this.clock = clock
    this.told = told
  }

  public follow(doing: Doing | null, moment: FigureMoment | null): void {
    if (moment !== null && moment.serial !== this.told) this.body.moment(moment.kind)
    if (moment !== null) this.told = moment.serial
    const now = this.clock()
    const wanted = doing
    if (wanted !== this.wanted) {
      this.wanted = wanted
      this.wantedSince = now
    }
    if (wanted !== null && HELD.has(wanted)) this.said(wanted, now)
    this.apply()
  }

  private said(act: Doing, now: number): void {
    if (this.shown === act) {
      this.touched = now
      this.owed = null
      return
    }
    if (this.owed?.doing === act) return
    this.owed = { doing: act, at: now }
  }

  public dispose(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.shown !== null) this.body.perform(null)
    this.shown = null
  }

  private apply(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    const now = this.clock()
    if (this.owed !== null && now - this.owed.at > LAG) this.owed = null
    const target = this.owed?.doing ?? this.wanted
    if (target === this.shown) {
      this.due = null
      return
    }
    let at =
      this.shown !== null && HELD.has(this.shown) ? Math.max(this.since, this.touched) + DWELL : now
    if (target !== null && GROUND.has(target)) at = Math.max(at, this.wantedSince + SETTLE)
    if (at <= now && this.shown !== null) {
      this.due ??= now
      const left = Math.max(0, this.body.strokeLeft?.() ?? 0)
      if (left > 0 && now + left <= this.due + LAG) at = now + left
    }
    if (this.owed !== null && at > this.owed.at + LAG) {
      this.owed = null
      this.apply()
      return
    }
    if (at > now) {
      this.timer = setTimeout(() => this.apply(), at - now)
      return
    }
    if (target === this.owed?.doing) this.owed = null
    this.show(target, now)
    if (target !== this.wanted) this.apply()
  }

  private show(next: Doing | null, now: number): void {
    this.shown = next
    this.since = now
    this.touched = now
    this.due = null
    this.body.perform(next)
  }
}
