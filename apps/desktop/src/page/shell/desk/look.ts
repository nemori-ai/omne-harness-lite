import type { Projection, ToastBoard } from '@omne-harness/shell-contract'
import type { Asked, LookDrawing, LookProjection, LookSource } from '../../desk/scene.ts'
import type { Outside, Watched } from '../state.ts'

/** What the shell gives the publisher: the projection its service makes, its log and pages, and the toasts it draws. */
export type LookFeed = Readonly<{
  projection: Watched<Projection | undefined>
  outside: Outside
  told: ToastBoard
}>

export type PublisherDeps = LookFeed &
  Readonly<{
    scope: () => string | undefined
    send: (look: LookProjection) => void
    /** After a new projection went out: a scene drawn with it is due. */
    changed: () => void
    issuer?: string
  }>

export type LookPublisher = Readonly<{
  /** Who made the projection a scene is drawn with, and which one: version 0 before the first. */
  stamp(): Readonly<{ issuer: string; version: number }>
  send(): void
  heard(message: Asked): void
  /** The lease ended: the toasts the desk asked for are taken back. */
  ended(): void
  dispose(): void
}>

const sourceOf = ({ module, export: name, files }: LookSource): LookSource =>
  files === undefined ? { module, export: name } : { module, export: name, files }

const sameSource = (one: LookSource, other: LookSource): boolean =>
  one.module === other.module && one.export === other.export && one.files === other.files

const sameDrawings = (one: readonly LookDrawing[], other: readonly LookDrawing[]): boolean =>
  one.length === other.length &&
  one.every((drawing, index) => {
    const twin = other[index]
    return (
      twin !== undefined &&
      drawing.point === twin.point &&
      drawing.key === twin.key &&
      sameSource(drawing.source, twin.source)
    )
  })

const TEXT_MOST = 240
const SAID_MOST = 64

/** Text a page sent up, before it reaches the log: one line, of a bounded length. */
const clipped = (text: string): string => {
  const line = text.replace(/\s+/gu, ' ')
  return line.length > TEXT_MOST ? `${line.slice(0, TEXT_MOST)}…` : line
}

class Publisher implements LookPublisher {
  private readonly said = new Set<string>()
  private readonly issuer: string
  private made: LookProjection | undefined
  private readonly owner = {}
  private readonly stop: () => void

  public constructor(private readonly deps: PublisherDeps) {
    this.issuer = deps.issuer ?? crypto.randomUUID()
    this.stop = deps.projection.subscribe(() => this.remake())
    this.remake()
  }

  public stamp(): Readonly<{ issuer: string; version: number }> {
    return { issuer: this.issuer, version: this.made?.version ?? 0 }
  }

  public send(): void {
    if (this.made !== undefined) this.deps.send(this.made)
  }

  public heard(message: Asked): void {
    if (message.issuer !== this.issuer) return
    if (message.kind === 'undrawn') {
      const [point, key, module, name, reason] = [
        message.point,
        message.key,
        message.module,
        message.export,
        message.reason,
      ].map(clipped)
      const said = `the desk got no drawing for ${point} ${key} from ${module}, export ${name}: ${reason}`
      if (this.said.has(said) || this.said.size >= SAID_MOST) return
      this.said.add(said)
      this.deps.outside.warn(said)
      return
    }
    if (message.scope !== this.deps.scope()) return
    if (message.kind === 'navigate') this.deps.outside.navigate(message.page, message.subject)
    else this.deps.told.show(this.owner, message.toast)
  }

  public ended(): void {
    this.deps.told.withdraw(this.owner)
  }

  public dispose(): void {
    this.stop()
  }

  /** A projection counts as new when its tenant, its sheet or one of its drawings differs from the last. */
  private remake(): void {
    const projection = this.deps.projection.get()
    if (projection === undefined) return
    const scope = this.deps.scope()
    const { css } = projection
    const drawings = projection.drawings.map(({ point, key, source }) => ({
      point,
      key,
      source: sourceOf(source),
    }))
    const was = this.made
    if (was !== undefined) {
      if (was.scope === scope && was.css === css && sameDrawings(was.drawings, drawings)) return
      if (was.scope !== scope) this.ended()
    }
    const version = (was?.version ?? 0) + 1
    this.made = {
      issuer: this.issuer,
      version,
      ...(scope === undefined ? {} : { scope }),
      css,
      drawings,
    }
    this.send()
    this.deps.changed()
  }
}

export const createLookPublisher = (deps: PublisherDeps): LookPublisher => new Publisher(deps)
