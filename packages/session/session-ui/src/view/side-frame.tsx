import { Button, FigureSeat } from '@omne-harness/ui-kit'
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

/** Docked where the page itself is at least 1160 wide, else behind the figure as its light ink bubble. */
export type SideFrame = Readonly<{
  wide: boolean
  shown: boolean
  /** The side content has entries: only then is the figure with the agent's name a control. */
  present: boolean
  sideId: string
  control: RefObject<HTMLButtonElement | null>
  header: RefObject<HTMLElement | null>
  toggle: () => void
  close: (returnFocus: boolean) => void
  hold: (present: boolean) => void
}>

export const SideFrameContext = createContext<SideFrame | null>(null)

export function useSideFrame(page: RefObject<HTMLElement | null>): SideFrame {
  const [wide, setWide] = useState(false)
  const [folded, setFolded] = useState(false)
  const [open, setOpen] = useState(false)
  const [present, setPresent] = useState(false)
  const control = useRef<HTMLButtonElement>(null)
  const header = useRef<HTMLElement>(null)
  const sideId = useId()
  useLayoutEffect(() => {
    const element = page.current
    if (element === null) return undefined
    const measure = (): void => {
      const docks = element.clientWidth >= 1160
      setWide(docks)
      if (docks) setOpen(false)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [page])
  const toggle = useCallback(() => {
    if (wide) setFolded(was => !was)
    else setOpen(was => !was)
  }, [wide])
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) control.current?.focus()
  }, [])
  return useMemo(
    () => ({
      wide,
      shown: wide ? !folded : open,
      present,
      sideId,
      control,
      header,
      toggle,
      close,
      hold: setPresent,
    }),
    [wide, folded, open, present, sideId, toggle, close],
  )
}

/** The header's seat (priority 2) and the agent's name: one control for the side content, if any. */
export function FigureControl({ frame }: { readonly frame: SideFrame | null }) {
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
      onClick={frame.toggle}
      onKeyDown={event => {
        if (event.key !== 'Escape' || frame.wide || !frame.shown) return
        event.stopPropagation()
        frame.close(true)
      }}
    >
      {seat}
      {name}
    </Button>
  )
}
