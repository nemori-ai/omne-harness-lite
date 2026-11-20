import { useLayoutEffect, useState } from 'react'

/** The seats the shell puts down itself, at priority 1; a module's seat is put down later and wins over them. */
const SHELL_SEATS: ReadonlySet<string> = new Set(['gate', 'home'])

/** A seat the figure can sit on: on the page, outside `[inert]`, with a box. */
function counts(seat: HTMLElement): boolean {
  if (!seat.isConnected || seat.closest('[inert]') !== null) return false
  const box = seat.getBoundingClientRect()
  return box.width >= 1 && box.height >= 1
}

/** The seat the figure sits on, picked as its store picks: a module's seat beats the shell's, the newest wins. */
export function activeSeat(root: ParentNode = document): HTMLElement | undefined {
  const seats = [...root.querySelectorAll<HTMLElement>('[data-figure-seat]')].filter(counts)
  return seats.findLast(seat => !SHELL_SEATS.has(seat.dataset['figureSeat'] ?? '')) ?? seats.at(-1)
}

/** A press on the figure is a press on the control its seat stands in: the home, a header's disclosure. */
export function pressSeat(): void {
  activeSeat()?.closest<HTMLElement>('button, a[href], [role="button"]')?.click()
}

const seatedHome = (): boolean => activeSeat()?.dataset['figureSeat'] === 'home'

/** Whether the figure sits at home: read after every render, and whenever a seat comes, goes or moves. */
export function useSeatedHome(): boolean {
  const [home, setHome] = useState(false)
  useLayoutEffect(() => setHome(seatedHome()))
  useLayoutEffect(() => {
    const read = (): void => setHome(seatedHome())
    const changed = new MutationObserver(read)
    changed.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'inert', 'data-width'],
    })
    window.addEventListener('resize', read)
    return () => {
      changed.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [])
  return home
}
