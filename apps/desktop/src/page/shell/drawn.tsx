import {
  Component,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { giveBack, heldFocus, type HeldFocus } from './kept-focus.ts'

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

/** Drawn by the drawing that stands, else by the fallback; focus the change takes away goes back to its part. */
export function Drawn<D extends object>({ watch, pick, put, fallback }: DrawnProps<D>): ReactNode {
  const held = useRef<HeldFocus | null>(null)
  const watching = useCallback(
    (listener: () => void) =>
      watch(() => {
        held.current = heldFocus(document)
        listener()
      }),
    [watch],
  )
  const drawing = useSyncExternalStore(watching, pick)
  useLayoutEffect(() => {
    const was = held.current
    held.current = null
    if (was !== null) giveBack(document, was)
  }, [drawing])
  if (drawing === undefined) return fallback()
  return (
    <Fallback key={markOf(drawing)} fallback={fallback}>
      <Put put={() => put(drawing)} />
    </Fallback>
  )
}
