import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import type { RenderDrawer } from '@omne-harness/shell-contract'
import { Component, type ReactNode } from 'react'
import { drawingsInConflict, type DrawingHost, type KindStanding } from '../model/kinds.ts'
import { canvasElement, type CanvasFrame } from '../points.ts'

/** The shell as the sheet uses it: draws by key, tells who stands on a key, and says when that changes. */
export type CanvasHost = RenderDrawer &
  DrawingHost &
  Readonly<{ watchChanges(listener: () => void): () => void }>

type Boundary = Readonly<{ fallback: () => ReactNode; children: ReactNode }>

/** One thing whose drawing throws while it renders falls back alone. */
class OneThing extends Component<Boundary, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback() : this.props.children
  }
}

const NOTE: Readonly<Record<Exclude<KindStanding['kind'], 'declared'>, string>> = {
  undeclared: '这一类现在没有声明',
  unreadable: '现在读不到',
}

/** The kind's name for people when it is declared; otherwise the name it is declared under. */
export const kindName = (item: CanvasItemBody, standing: KindStanding): string =>
  standing.kind === 'declared' ? standing.label : item.reference.kind

function Generic({
  item,
  standing,
  note,
}: Readonly<{ item: CanvasItemBody; standing: KindStanding; note?: string }>) {
  return (
    <div className="canvas-generic" data-standing={standing.kind}>
      <span className="canvas-generic-kind">{kindName(item, standing)}</span>
      <span className="canvas-generic-ref">{item.reference.ref}</span>
      {note === undefined ? null : <span className="canvas-generic-note">{note}</span>}
    </div>
  )
}

export type ElementProps = Readonly<{
  host: CanvasHost
  scope: string
  item: CanvasItemBody
  standing: KindStanding
  frame: CanvasFrame
  /** Changes whenever the registry does, so a drawing that failed is tried again. */
  round: number
}>

/** A thing on the sheet: drawn by its kind's drawing while the kind is declared, else generic with why. */
export function Element({ host, scope, item, standing, frame, round }: ElementProps): ReactNode {
  if (standing.kind !== 'declared')
    return <Generic item={item} standing={standing} note={NOTE[standing.kind]} />
  let fell = false
  const generic = (): ReactNode => {
    fell = true
    return <Generic item={item} standing={standing} />
  }
  const subject = { reference: item.reference, frame }
  const drawn = canvasElement.draw(host, item.reference.kind, subject, generic)
  const conflict = fell ? drawingsInConflict(host, item.reference.kind, scope) : []
  if (conflict.length > 0)
    return (
      <Generic
        item={item}
        standing={standing}
        note={`这一类有两份画法，互相冲突：${conflict.join('、')}`}
      />
    )
  return (
    <OneThing key={round} fallback={generic}>
      {drawn}
    </OneThing>
  )
}
