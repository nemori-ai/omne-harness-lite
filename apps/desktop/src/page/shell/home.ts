import type { MergedFigure, PageItem } from '@omne-harness/shell-contract'
import type { FaceChoice, ShellState } from './state.ts'

const ownerOf = (owners: readonly object[] = []): object | undefined =>
  owners.length === 1 ? owners[0] : undefined

/** The modules' reports merged (R4-1): the module whose page is on show is in front. */
export function mergedOf(
  state: ShellState,
  pages: readonly PageItem[],
  shown: string | undefined,
): MergedFigure {
  return state.figure.merged({
    foreground: shown === undefined ? undefined : ownerOf(state.pageOwners.get(shown)),
    pages: pages.map(page => page.id),
  })
}

/** The page the home goes to: the one waiting for an answer, or the earliest. */
export const homeOf = (merged: MergedFigure, pages: readonly PageItem[]): string | undefined =>
  merged.waiting > 0 && merged.waitingPage !== undefined ? merged.waitingPage : pages[0]?.id

/** From the back to the front; a call while a flip plays stops it first, then turns. */
export function toFront(face: FaceChoice): void {
  face.turn()
  if (face.get() === 'back') face.turn()
}

/** A press on the home, from either face: to the page it goes to now, on the front. */
export function goHome(state: ShellState): void {
  const pages = state.slots.items('pages')
  const page = homeOf(mergedOf(state, pages, state.page.get()), pages)
  if (page === undefined) return
  if (state.face.get() === 'back') toFront(state.face)
  state.page.choose(page)
}
