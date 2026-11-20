import { Button, FigureSeat, useSizeFactor } from '@omne-harness/ui-kit'
import {
  createContext,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'

const AGENT_NAME = 'Agent'

/** The page width (px at the standard size) the docked column needs, drawn at the app's size like the column. */
const DOCK_ROOM = 1160

const dockFits = (width: number, factor: number): boolean => width >= DOCK_ROOM * factor

/** Docked where the page itself is wide enough (`DOCK_ROOM`), else behind the figure as its light ink bubble. */
export type SideFrame = Readonly<{
  wide: boolean
  shown: boolean
  openedByKeyboard: boolean
  /** The side content has entries: only then is the figure with the agent's name a control. */
  present: boolean
  sideId: string
  control: RefObject<HTMLButtonElement | null>
  header: RefObject<HTMLElement | null>
  toggle: (keyboard: boolean) => void
  close: (returnFocus: boolean) => void
  hold: (present: boolean) => void
}>

export const SideFrameContext = createContext<SideFrame | null>(null)

export function useSideFrame(page: RefObject<HTMLElement | null>): SideFrame {
  const [wide, setWide] = useState(false)
  const [folded, setFolded] = useState(false)
  const [open, setOpen] = useState(false)
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false)
  const [present, setPresent] = useState(false)
  const factor = useSizeFactor()
  const control = useRef<HTMLButtonElement>(null)
  const header = useRef<HTMLElement>(null)
  const sideId = useId()
  useLayoutEffect(() => {
    const element = page.current
    if (element === null) return undefined
    const measure = (): void => {
      const docks = dockFits(element.clientWidth, factor)
      setWide(docks)
      if (docks) setOpen(false)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [page, factor])
  const toggle = useCallback(
    (fromKeyboard: boolean) => {
      if (wide) setFolded(was => !was)
      else {
        setOpen(was => !was)
        setOpenedByKeyboard(fromKeyboard)
      }
    },
    [wide],
  )
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) control.current?.focus()
  }, [])
  return useMemo(
    () => ({
      wide,
      shown: wide ? !folded : open,
      openedByKeyboard,
      present,
      sideId,
      control,
      header,
      toggle,
      close,
      hold: setPresent,
    }),
    [wide, folded, open, openedByKeyboard, present, sideId, toggle, close],
  )
}

/** The header's seat (priority 2) and the agent's name: one control for the side content, if any. */
export function FigureControl({ frame }: { readonly frame: SideFrame | null }) {
  const keyed = useRef(false)
  const seat = <FigureSeat name="header" priority={2} className="omne-session-figure-seat" />
  const name = <span className="omne-session-figure-name">{AGENT_NAME}</span>
  if (frame === null || !frame.present)
    return (
      <span className="omne-session-figure">
        {seat}
        {name}
      </span>
    )
  return (
    <Button
      ref={frame.control}
      variant="ghost"
      className="omne-session-figure"
      aria-expanded={frame.shown}
      aria-controls={frame.sideId}
      onPointerDown={event => {
        // A press lets go of keyboard focus first, so no ring stays round the figure (agent-work-panel.tsx, c0073196).
        keyed.current = false
        if (event.button === 0 && document.activeElement === event.currentTarget)
          event.currentTarget.blur()
      }}
      onClick={event => {
        const fromKeyboard = keyed.current
        keyed.current = false
        // The figure drawn over the seat passes its press on as a bare click: that too takes focus the pointer's way.
        if (!fromKeyboard && document.activeElement === event.currentTarget) {
          event.currentTarget.blur()
          event.currentTarget.focus({ preventScroll: true })
        }
        frame.toggle(fromKeyboard)
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') keyed.current = true
        if (event.key !== 'Escape' || frame.wide || !frame.shown) return
        event.stopPropagation()
        frame.close(true)
      }}
      onBlur={() => {
        keyed.current = false
      }}
    >
      {seat}
      {name}
    </Button>
  )
}
