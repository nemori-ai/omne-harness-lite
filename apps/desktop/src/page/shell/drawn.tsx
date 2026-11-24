import { Component, useSyncExternalStore, type ReactNode } from 'react'

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

function Put(props: { put: () => ReactNode }): ReactNode {
  return props.put()
}

const marks = new WeakMap<object, number>()
let minted = 0

function markOf(drawing: object): number {
  const held = marks.get(drawing)
  if (held !== undefined) return held
  minted += 1
  marks.set(drawing, minted)
  return minted
}

export type DrawnProps<D extends object> = Readonly<{
  watch: (listener: () => void) => () => void
  pick: () => D | undefined
  put: (drawing: D) => ReactNode
  fallback: () => ReactNode
}>

/** Drawn by the drawing that stands; with none, or when that one throws, by the fallback. */
export function Drawn<D extends object>({ watch, pick, put, fallback }: DrawnProps<D>): ReactNode {
  const drawing = useSyncExternalStore(watch, pick)
  if (drawing === undefined) return fallback()
  return (
    <Fallback key={markOf(drawing)} fallback={fallback}>
      <Put put={() => put(drawing)} />
    </Fallback>
  )
}
