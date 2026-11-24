import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { rowFor, rowFrom, type EntryFocus, type FocusTarget } from '../model/entry-focus.ts'

/** Where a jump to a message is asked for; absent: this tree has nobody who asks. */
export const EntryFocusContext = createContext<EntryFocus | null>(null)

const NEVER = () => () => {}
const NOTHING = () => null

// A run whose start is not among the entries read has no row: the page stays where it is.
function rowOf(
  target: FocusTarget,
  rows: readonly string[],
  startOf: (run: string) => string | null,
): string | null {
  if ('entry' in target) return rowFor(rows, target.entry)
  const start = startOf(target.run)
  return start === null ? null : rowFrom(rows, start)
}

// A message is shown in the middle of the page; a run is shown from its start.
const blockOf = (target: FocusTarget): ScrollLogicalPosition =>
  'entry' in target ? 'center' : 'start'

// Shows what was asked for once the history of its session is on the page: scrolls its row into
// view and gives the row's key, so that it can be marked. The ask is taken, not kept.
export function useShownEntry(
  session: string,
  scroller: RefObject<HTMLElement | null>,
  rows: readonly string[],
  loaded: boolean,
  startOf: (run: string) => string | null,
): string | null {
  const focus = useContext(EntryFocusContext)
  const target = useSyncExternalStore(focus?.subscribe ?? NEVER, focus?.read ?? NOTHING)
  const [found, setFound] = useState<string | null>(null)
  useEffect(() => {
    if (focus === null || target === null || target.session !== session || !loaded) return
    const row = rowOf(target, rows, startOf)
    focus.set(null)
    setFound(row)
    if (row === null) return
    const node = scroller.current?.querySelector(`[data-entry="${row}"]`)
    node?.scrollIntoView({ block: blockOf(target) })
  }, [focus, target, session, loaded, rows, scroller, startOf])
  return found
}
