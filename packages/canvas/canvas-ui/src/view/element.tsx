import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import type { RenderDrawer } from '@omne-harness/shell-contract'
import { Component, type ReactNode } from 'react'
import { drawingsInConflict, type DrawingHost, type KindStanding } from '../model/kinds.ts'
import { CANVAS_ELEMENT, canvasElement, type CanvasFrame } from '../points.ts'

/** The shell as the sheet uses it: draws by key, tells who stands on a key, and says when that changes. */
export type CanvasHost = RenderDrawer &
  DrawingHost &
  Readonly<{ watchChanges(listener: () => void): () => void }>

type Boundary = Readonly<{ fallback: () => ReactNode; children: ReactNode; again?: number }>

/** One thing whose drawing throws while it renders falls back alone; a new `again` tries it once more. */
export class OneThing extends Component<Boundary, { failed: boolean; again: number | undefined }> {
  override state = { failed: false, again: this.props.again }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: Boundary,
    state: { failed: boolean; again: number | undefined },
  ): { failed: boolean; again: number | undefined } | null {
    return props.again === state.again ? null : { failed: false, again: props.again }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback() : this.props.children
  }
}

/** Who put two drawings on one key, said where the drawing would be; nothing when there are not two. */
export function inConflict(
  host: CanvasHost,
  point: string,
  key: string,
  scope: string | undefined,
): string | undefined {
  const owners = drawingsInConflict(host, point, key, scope)
  return owners.length > 1 ? owners.join('、') : undefined
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
  const generic = (): ReactNode => {
    const owners = inConflict(host, CANVAS_ELEMENT, item.reference.kind, scope)
    const note = owners === undefined ? {} : { note: `这一类有两份画法，互相冲突：${owners}` }
    return <Generic item={item} standing={standing} {...note} />
  }
  const subject = { reference: item.reference, frame }
  return (
    <OneThing key={round} fallback={generic}>
      {canvasElement.draw(host, item.reference.kind, subject, generic)}
    </OneThing>
  )
}
