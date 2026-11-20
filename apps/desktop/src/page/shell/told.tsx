import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import type { Toast } from '@omne-harness/shell-contract'
import { FIGURE_SIZE, ToldNote, useSizeFactor, type Told } from '@omne-harness/ui-kit'
import type { ShellState } from './state.ts'

/** How far the note stands past the figure's edge: the kit's bubble gap (`BESIDE.gap`, ink-bubble.tsx). */
const NOTE_GAP = 2

/** A toast's words as the figure says them: its title, then its one line of body. */
export function toldText(toast: Toast): string {
  return toast.body === undefined ? toast.title : `${toast.title}：${toast.body}`
}

/** The note's room at home (source told-note.css): from beside the figure to an inline gap before the fold. */
function useRoom(sidebar: RefObject<HTMLElement | null>, telling: boolean): number | undefined {
  const factor = useSizeFactor()
  const [room, setRoom] = useState<number>()
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
      setRoom(Math.max(0, fold.getBoundingClientRect().left - inline - start))
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
    <div className="shell-told" style={room === undefined ? undefined : { maxWidth: room }}>
      <ToldNote said={telling} onOpen={open} />
    </div>
  )
}
