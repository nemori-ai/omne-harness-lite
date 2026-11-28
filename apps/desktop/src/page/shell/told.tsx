import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import type { Toast } from '@omne-harness/shell-contract'
import { FIGURE_SIZE, ToldNote, useSizeFactor, type Told } from '@omne-harness/ui-kit'
import { shellFigureTold } from './parts.ts'
import type { ShellState } from './state.ts'

/** How far the note stands past the figure's edge: the kit's bubble gap (`BESIDE.gap`, ink-bubble.tsx). */
const NOTE_GAP = 2
/** How far the note's top stands above the figure's middle: the kit's bubble level (`BESIDE.level`, ink-bubble.tsx). */
const NOTE_LEVEL = 20
const FEWEST_LINES = 2

/** A toast's words as the figure says them: its title, then its one line of body. */
export function toldText(toast: Toast): string {
  return toast.body === undefined ? toast.title : `${toast.title}：${toast.body}`
}

/** The note's whole lines of `line` px in `room` px down to the first nav row, less its padding; at least 2 (OD-20). */
export function toldLineCap(room: number, line: number, padding: number): number {
  return Math.max(FEWEST_LINES, Math.floor((room - padding) / line))
}

function linesDown(host: HTMLElement, top: number): number | undefined {
  const row = host.querySelector(
    '.shell-navigation-content :is(.shell-reconnecting, .shell-nav-link)',
  )
  const note = host.querySelector('.omne-told-note')
  const words = note?.querySelector('.omne-told-note-words')
  if (row == null || note == null || words == null) return undefined
  const box = getComputedStyle(note)
  const line = Number.parseFloat(getComputedStyle(words).lineHeight)
  const padding = Number.parseFloat(box.paddingTop) + Number.parseFloat(box.paddingBottom)
  if (!(line > 0) || Number.isNaN(padding)) return undefined
  return toldLineCap(row.getBoundingClientRect().top - top, line, padding)
}

type Room = Readonly<{ width: number; lines: number | undefined }>

/** The note's room at home: across to a gap before the fold (source told-note.css), down to the first nav row. */
function useRoom(sidebar: RefObject<HTMLElement | null>, telling: boolean): Room | undefined {
  const factor = useSizeFactor()
  const [room, setRoom] = useState<Room>()
  useLayoutEffect(() => {
    if (!telling) return undefined
    const measure = (): void => {
      const host = sidebar.current
      const fold = host?.querySelector('.shell-fold')
      const seat = host?.querySelector('[data-figure-seat="home"]')
      if (host == null || fold == null || seat == null) return
      const inline =
        Number.parseFloat(getComputedStyle(host).getPropertyValue('--omne-space-inline')) || 0
      const box = seat.getBoundingClientRect()
      const start = box.left + box.width / 2 + (FIGURE_SIZE * factor) / 2 + NOTE_GAP
      const width = Math.max(0, fold.getBoundingClientRect().left - inline - start)
      const lines = linesDown(host, box.top + box.height / 2 - NOTE_LEVEL)
      setRoom(was => (was?.width === width && was.lines === lines ? was : { width, lines }))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [sidebar, telling, factor])
  return room
}

/** The told note beside the figure at home; a press on it goes where its action points, and puts it away. */
export function ToldAtHome(props: { state: ShellState; sidebar: RefObject<HTMLElement | null> }) {
  const { told, page } = props.state
  const said = useSyncExternalStore(told.subscribe, told.said)
  const room = useRoom(props.sidebar, said !== undefined)
  const telling: Told | null =
    said === undefined ? null : { id: said.key, text: toldText(said.toast) }
  const open = (): void => {
    const action = told.said()?.toast.action
    told.dismiss()
    if (action !== undefined) page.choose(action.page, action.subject)
  }
  return (
    <div className="shell-told" style={room === undefined ? undefined : { maxWidth: room.width }}>
      <ToldNote said={telling} onOpen={open} maxLines={room?.lines} {...shellFigureTold.props} />
    </div>
  )
}
