import type { AttachedEntry } from '@omne-harness/shell-contract'
import {
  focusSurface,
  FoldIcon,
  IconButton,
  InkBubble,
  Segmented,
  type Box,
} from '@omne-harness/ui-kit'
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { SideFrameContext, type SideFrame } from './side-frame.tsx'
import { sessionSide } from '../parts.ts'

/** An entry of the side content; the session's own entries may carry how many things they list. */
export type SideEntry = AttachedEntry & Readonly<{ count?: number }>

/** How far below the header's hairline the bubble opens (px): the source's `BELOW_RULE`. */
const BELOW_RULE = 8

const LABEL = '会话的侧边区'

const titleOf = (entry: AttachedEntry): string => entry.label ?? entry.id

/** A title and its number, as the source writes its panel's group headings. */
function Titled({ entry }: { readonly entry: SideEntry }) {
  return (
    <>
      <span className="omne-session-side-label">{titleOf(entry)}</span>
      {entry.count === undefined ? null : (
        <span className="omne-session-side-number">{entry.count}</span>
      )}
    </>
  )
}

export function SidePanel({ entries }: { readonly entries: readonly SideEntry[] }) {
  const frame = useContext(SideFrameContext)
  const [own, setOwn] = useState<string | undefined>(undefined)
  const chosen = frame === null ? own : frame.chosen
  const choose = frame === null ? setOwn : frame.choose
  const present = entries.length > 0
  const hold = frame?.hold
  useLayoutEffect(() => {
    if (hold === undefined) return undefined
    hold(present)
    return () => hold(false)
  }, [hold, present])
  const active = entries.find(entry => entry.id === chosen) ?? entries[0]
  if (active === undefined) return null
  const docked = frame === null || frame.wide
  const contents = (
    <>
      <div className="omne-session-side-bar">
        {entries.length > 1 ? (
          <Segmented
            label="侧边区的页签"
            value={active.id}
            onValueChange={choose}
            options={entries.map(entry => ({ value: entry.id, label: <Titled entry={entry} /> }))}
          />
        ) : (
          <h3 className="omne-session-side-title">
            <Titled entry={active} />
          </h3>
        )}
        {docked && frame !== null ? (
          <IconButton label="收起侧边区" tooltipSide="left" onClick={() => frame.toggle(false)}>
            <FoldIcon aria-hidden="true" data-icon-reversed="" />
          </IconButton>
        ) : null}
      </div>
      <div
        className="omne-session-side-body"
        role="group"
        aria-label={titleOf(active)}
        tabIndex={0}
        data-initial-focus
      >
        {entries.map(entry => (
          <div key={entry.id} data-side-pane={entry.id} hidden={entry.id !== active.id}>
            {entry.node}
          </div>
        ))}
      </div>
    </>
  )
  if (docked) {
    const open = frame === null || frame.shown
    return (
      <aside
        id={frame?.sideId}
        className="omne-session-side"
        {...sessionSide.props}
        data-presentation="docked"
        data-open={open}
        data-keyboard-region="side"
        inert={!open}
        aria-label={LABEL}
      >
        <div className="omne-session-side-sheet">{contents}</div>
      </aside>
    )
  }
  return <SideBubble frame={frame}>{contents}</SideBubble>
}

/** Open while asked for, then kept until its ink has rolled back; a new opening is a new writing. */
function useUnfold(open: boolean) {
  const [state, setState] = useState({ open, kept: open, serial: open ? 1 : 0 })
  let now = state
  if (open !== state.open) {
    now = { open, kept: open || state.kept, serial: open ? state.serial + 1 : state.serial }
    setState(now)
  }
  const { serial } = now
  const gone = useCallback(
    () => setState(was => (was.serial === serial && !was.open ? { ...was, kept: false } : was)),
    [serial],
  )
  return { kept: now.kept, closing: !open && now.kept, serial, gone }
}

type SeatBox = Readonly<{ figure: Box; bounds: Box }>

const boxOf = (rect: DOMRect): Box => ({
  x: rect.left,
  y: rect.top,
  width: rect.width,
  height: rect.height,
})

/** The seat's box and the room under the header, from `BELOW_RULE` under its hairline to the window's foot. */
function useSeatBox(frame: SideFrame, on: boolean): SeatBox | null {
  const [box, setBox] = useState<SeatBox | null>(null)
  const { control, header } = frame
  useLayoutEffect(() => {
    if (!on) return undefined
    const look = (): void => {
      const button = control.current
      const rule = header.current?.getBoundingClientRect()
      if (button === null || rule === undefined) return
      const seat = (button.querySelector('[data-figure-seat]') ?? button).getBoundingClientRect()
      const top = rule.bottom + BELOW_RULE
      setBox({
        figure: boxOf(seat),
        bounds: { x: rule.left, y: top, width: rule.width, height: window.innerHeight - top },
      })
    }
    look()
    window.addEventListener('resize', look)
    return () => window.removeEventListener('resize', look)
  }, [control, header, on])
  return box
}

/** The light ink bubble: a keyboard opening gives it the focus, Escape gives it back, a press elsewhere folds it. */
function SideBubble({
  frame,
  children,
}: {
  readonly frame: SideFrame
  readonly children: ReactNode
}) {
  const unfold = useUnfold(frame.shown)
  const bubble = useRef<HTMLElement>(null)
  const box = useSeatBox(frame, unfold.kept)
  const { shown, openedByKeyboard, close, control } = frame
  useEffect(() => {
    if (!shown || !openedByKeyboard) return undefined
    const frameId = requestAnimationFrame(() => {
      if (bubble.current !== null) focusSurface(bubble.current)
    })
    return () => cancelAnimationFrame(frameId)
  }, [shown, openedByKeyboard])
  useEffect(() => {
    if (!shown) return undefined
    const pressed = (event: PointerEvent): void => {
      const path = event.composedPath()
      if (path.some(node => node === control.current || node === bubble.current)) return
      close(false)
    }
    document.addEventListener('pointerdown', pressed, true)
    return () => document.removeEventListener('pointerdown', pressed, true)
  }, [shown, close, control])
  if (!unfold.kept || box === null) return null
  return (
    <InkBubble
      key={unfold.serial}
      ref={bubble}
      as="section"
      id={frame.sideId}
      className="omne-session-side"
      {...sessionSide.props}
      data-presentation="bubble"
      data-keyboard-region="side"
      aria-label={LABEL}
      inert={unfold.closing}
      ink="light"
      side="below"
      figure={box.figure}
      bounds={box.bounds}
      closing={unfold.closing}
      onGone={unfold.gone}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        close(true)
      }}
      style={{ maxWidth: box.bounds.width, maxHeight: box.bounds.height - BELOW_RULE }}
    >
      {children}
    </InkBubble>
  )
}
