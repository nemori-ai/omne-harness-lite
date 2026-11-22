import { PART_ATTRIBUTE, type PartRender } from '@omne-harness/shell-contract'
import { Component, useSyncExternalStore, type ReactNode } from 'react'

export type DrawingSource = Readonly<{
  renderOf: (part: string) => PartRender | undefined
  watch: (listener: () => void) => () => void
}>

type FallbackProps = Readonly<{ fallback: () => ReactNode; children: ReactNode }>

class Fallback extends Component<FallbackProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback() : this.props.children
  }
}

type Given = Parameters<PartRender>[0]

function Put(props: { render: PartRender; given: Given }): ReactNode {
  return props.render(props.given)
}

const marks = new WeakMap<PartRender, number>()
let minted = 0

function markOf(render: PartRender): number {
  const held = marks.get(render)
  if (held !== undefined) return held
  minted += 1
  marks.set(render, minted)
  return minted
}

export type DrawnProps = Readonly<{
  source: DrawingSource
  part: string
  builtIn: () => ReactNode
  given: unknown
}>

/** A part drawn by the drawing put on it; with none, or when that one throws, by the drawing it shipped with. */
export function Drawn({ source, part, builtIn, given }: DrawnProps): ReactNode {
  const render = useSyncExternalStore(source.watch, () => source.renderOf(part))
  if (render === undefined) return builtIn()
  const handed = { props: given as never, part: { [PART_ATTRIBUTE]: part }, builtIn }
  return (
    <Fallback key={markOf(render)} fallback={builtIn}>
      <Put render={render} given={handed} />
    </Fallback>
  )
}
