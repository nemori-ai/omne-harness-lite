import type { Point } from '../../desk/scene.ts'
import type { FigureFacts } from './device.ts'
import { insideApp } from './sign.ts'
import type { Gift } from '../say-note.ts'
import type { Framed, Keys, Seen, WindowLook } from './window-look.ts'
import type { WhereEvent, Whereabouts } from './whereabouts.ts'

type Side = 'page' | 'desk'

export type LetGoDeps = Readonly<{
  look: WindowLook
  where(): Whereabouts
  read(): boolean
  facts(): FigureFacts | null | undefined
  lease(): number | null
  scope(): string | undefined
  /** One step of the whereabouts; for the page's own hand, whether the page keeps it. */
  run(event: WhereEvent, fromPage: boolean): boolean
  seen(gift: Gift): void
  publish(): void
}>

function giftOf(seen: Seen): Gift {
  if (seen.kind === 'pictures') return seen
  return { pictures: [], told: seen, send: false }
}

/** Letting go (SPEC 桌面层, 松手落在哪): of the hand the desk draws, a framed window is read, and in the app's window `own` is asked first. */
export class LetGo {
  private owning = false

  public constructor(private readonly deps: LetGoDeps) {}

  /** Whether a drop still waits for `own`: the lease ending then counts as let go. */
  public waiting(): boolean {
    return this.owning
  }

  /** The whereabouts moved: a drop still waiting for `own` is given up. */
  public moved(): void {
    this.deps.look.cancelOwn()
    this.owning = false
  }

  public drop(on: Side, at: Point, keys: Keys, fromPage: boolean): boolean {
    const { deps } = this
    const drop = { kind: 'drop', on, at } as const
    const where = deps.where()
    if (where.at !== 'hand' || where.drawn !== 'desk' || where.on !== on)
      return deps.run(drop, fromPage)
    const framed = keys.meta ? deps.look.framed() : null
    deps.look.stop()
    if (framed !== null) {
      deps.run({ ...drop, look: true }, fromPage)
      this.readWindow(framed, at, keys.shift)
      return true
    }
    if (!deps.read() || !insideApp(deps.facts(), at)) return deps.run(drop, fromPage)
    this.owning = true
    deps.look.own(at, covered => void deps.run({ ...drop, covered }, fromPage))
    deps.publish()
    return true
  }

  private readWindow(framed: Framed, at: Point, send: boolean): void {
    const { deps } = this
    const lease = deps.lease()
    const scope = deps.scope()
    if (lease === null) return
    const live = () => deps.lease() === lease && deps.scope() === scope
    deps.look.read(lease, framed.id, at, send, live, seen => deps.seen(giftOf(seen)))
  }
}
