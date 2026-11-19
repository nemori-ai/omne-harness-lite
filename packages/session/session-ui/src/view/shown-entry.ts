import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { rowFor, type EntryFocus } from '../model/entry-focus.ts'

/** Where a jump to a message is asked for; absent: this tree has nobody who asks. */
export const EntryFocusContext = createContext<EntryFocus | null>(null)

const NEVER = () => () => {}
const NOTHING = () => null

// Shows the entry that was asked for once the history of its session is on the page: scrolls its
// row into view and gives the row's key, so that it can be marked. The ask is taken, not kept.
export function useShownEntry(
  session: string,
  scroller: RefObject<HTMLElement | null>,
  rows: readonly string[],
  loaded: boolean,
): string | null {
  const focus = useContext(EntryFocusContext)
  const target = useSyncExternalStore(focus?.subscribe ?? NEVER, focus?.read ?? NOTHING)
  const [found, setFound] = useState<string | null>(null)
  useEffect(() => {
    if (focus === null || target === null || target.session !== session || !loaded) return
    const row = rowFor(rows, target.entry)
    focus.set(null)
    setFound(row)
    if (row === null) return
    const node = scroller.current?.querySelector(`[data-entry="${row}"]`)
    node?.scrollIntoView({ block: 'center' })
  }, [focus, target, session, loaded, rows, scroller])
  return found
}
