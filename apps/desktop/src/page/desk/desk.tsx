import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  FIGURE_SIZE,
  FigureLabel,
  LooseFigure,
  useSizeFactor,
  type LooseControl,
} from '@omne-harness/ui-kit'
import {
  newer,
  type DeskInput,
  type Down,
  type Point,
  type Rect,
  type Scene,
  type Up,
} from './scene.ts'

export type DeskDeps = Readonly<{
  post(message: Up): void
  listen(listener: (message: Down) => void): () => void
  hot(lease: number, rects: readonly Rect[]): void
  frame(callback: () => void): void
  origin(): Point
}>

type HandAt = Readonly<{ client: Point }>

const homeOf = (scene: Scene): string =>
  scene.where.mode === 'home' ? `${scene.lease} ${scene.where.at.x} ${scene.where.at.y}` : ''

/** Calls `report` in the first frame after the document is visible: never in the step that took the scene. */
function firstShownFrame(frame: (callback: () => void) => void, report: () => void): () => void {
  let live = true
  const go = () => frame(() => live && report())
  const seen = () => {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', seen)
    go()
  }
  if (document.visibilityState === 'visible') go()
  else document.addEventListener('visibilitychange', seen)
  return () => {
    live = false
    document.removeEventListener('visibilitychange', seen)
  }
}

function useLook(scene: Scene | null): void {
  const theme = scene?.look.theme
  const size = scene?.look.size
  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme !== undefined) root.dataset['theme'] = theme
    if (size === 'medium') delete root.dataset['size']
    else if (size !== undefined) root.dataset['size'] = size
  }, [theme, size])
}

/** The desk page draws the scene it holds and tells the shell what happened to it; it has no facts of its own. */
export function DeskPage({ deps }: { readonly deps: DeskDeps }): React.JSX.Element {
  const [scene, setScene] = useState<Scene | null>(null)
  const [hand, setHand] = useState<Point | null>(null)
  const held = useRef<Scene | null>(null)
  const arrived = useRef('')
  const hotSent = useRef('')
  const control = useRef<LooseControl>(null)
  const factor = useSizeFactor()
  useLook(scene)

  useEffect(() => {
    const stop = deps.listen(message => {
      if (message.kind === 'hand') {
        if (message.lease === held.current?.lease) setHand(message.at)
        return
      }
      const next = message.scene
      if (!newer(next, held.current)) return
      held.current = next
      setScene(next)
      setHand(null)
      const said = { lease: next.lease, serial: next.serial }
      if (next.where.mode === 'none') deps.post({ kind: 'cleared', ...said })
      else if (arrived.current !== '' && arrived.current === homeOf(next))
        deps.post({ kind: 'arrived', ...said })
      if (next.where.mode !== 'home') arrived.current = ''
    })
    deps.post({ kind: 'hello' })
    return stop
  }, [deps])

  useLayoutEffect(() => {
    if (scene?.where.mode !== 'hand') return undefined
    return firstShownFrame(deps.frame, () => {
      if (held.current === scene)
        deps.post({ kind: 'painted', lease: scene.lease, serial: scene.serial })
    })
  }, [scene, deps])

  useLayoutEffect(() => {
    const box = scene === null ? null : (control.current?.reach() ?? null)
    if (scene === null || box === null) return
    const origin = deps.origin()
    const rects = [{ ...box, x: box.x + origin.x, y: box.y + origin.y }]
    const key = `${scene.lease} ${JSON.stringify(rects)}`
    if (key === hotSent.current) return
    hotSent.current = key
    deps.hot(scene.lease, rects)
  }, [scene, deps])

  const report = (input: DeskInput) => (at?: HandAt) => {
    const lease = held.current?.lease
    if (lease === undefined) return
    const origin = deps.origin()
    const screen =
      at === undefined ? null : { x: at.client.x + origin.x, y: at.client.y + origin.y }
    deps.post({ kind: 'input', lease, input, at: screen })
  }
  const onArrived = () => {
    const now = held.current
    if (now === null || now.where.mode !== 'home') return
    arrived.current = homeOf(now)
    deps.post({ kind: 'arrived', lease: now.lease, serial: now.serial })
  }

  const where = scene?.where ?? { mode: 'none' }
  const origin = deps.origin()
  const point = where.mode === 'none' ? null : where.mode === 'hand' ? (hand ?? where.at) : where.at
  const at = point === null ? null : { x: point.x - origin.x, y: point.y - origin.y }
  const size = FIGURE_SIZE * factor
  const placed =
    at === null || where.mode === 'none' ? { mode: 'none' as const } : { mode: where.mode, at }
  return (
    <main
      className="desk"
      data-mode={where.mode}
      data-doing={scene?.figure.doing ?? 'idle'}
      data-waiting={scene?.figure.waiting ?? 0}
    >
      <LooseFigure
        {...placed}
        doing={scene?.figure.doing}
        moment={scene?.figure.moment}
        waiting={scene?.figure.waiting ?? 0}
        reduced={scene?.look.reduced}
        control={control}
        onLift={report('lift')}
        onMove={report('move')}
        onDrop={report('drop')}
        onCancel={report('cancel')}
        onClick={report('click')}
        onDoubleClick={report('double')}
        onArrived={onArrived}
      />
      {scene?.label != null && at !== null && where.mode === 'hand' ? (
        <FigureLabel
          figure={{ x: at.x - size / 2, y: at.y - size / 2, width: size, height: size }}
          bounds={{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }}
          lines={scene.label}
        />
      ) : null}
    </main>
  )
}
