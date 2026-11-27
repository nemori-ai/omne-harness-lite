import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { VIEW_MARK, type ViewAsked, type ViewLook, type ViewMark } from '../../shared/view.ts'
import type { PageFloor } from './floor.ts'
import type { ShellState } from './state.ts'
import type { TenantTexts } from './tenant-text.ts'

/** What the drawing page knows at one moment. `settled` is true once everything the tenant loads has had an outcome. */
export type ViewFacts = Readonly<{
  signedIn: boolean
  pages: readonly string[]
  drawn: boolean
  settled: boolean
  worn: string | undefined
  fellBack: boolean
}>

/** Ready once the page asked for is drawn in the look asked for; before everything has settled, a lack is not yet a no. */
export function judgeView(view: ViewAsked, facts: ViewFacts): ViewMark | undefined {
  if (facts.fellBack) return 'no-skin'
  const wanted = view.look.kind === 'skin' ? view.look.name : undefined
  const there = facts.pages.includes(view.page)
  const worn = facts.worn === wanted
  if (facts.signedIn && there && worn && facts.drawn) return 'ready'
  if (!facts.settled) return undefined
  if (!there) return 'no-page'
  return worn ? undefined : 'no-skin'
}

/** A store that keeps what is written while this page lives, and never touches the device's own. */
export function memoryStorage(): Storage {
  const kept = new Map<string, string>()
  return {
    get length() {
      return kept.size
    },
    clear: () => kept.clear(),
    getItem: key => kept.get(key) ?? null,
    key: index => [...kept.keys()][index] ?? null,
    removeItem: key => void kept.delete(key),
    setItem: (key, value) => void kept.set(key, String(value)),
  }
}

/** The look the request names, for whichever tenant; a different choice written back means it could not be worn. */
export function viewLooks(look: ViewLook, fellBack: () => void): TenantTexts {
  const text = JSON.stringify(
    look.kind === 'skin' ? { kind: 'named', name: look.name } : { kind: 'builtin' },
  )
  return {
    read: () => text,
    write: (_tenant, written) => {
      if (written !== text) fellBack()
    },
  }
}

const POLL_MS = 50

/** Tells the window how the drawing went, once, on the root element; it reads the facts until they answer. */
export function viewWatch(
  input: Readonly<{
    view: ViewAsked
    state: ShellState
    floor: PageFloor
    fellBack: () => boolean
    root: HTMLElement
  }>,
) {
  const { view, state, floor, root } = input
  const drawn = (): boolean =>
    (root.ownerDocument.querySelector(`[data-page="${CSS.escape(view.page)}"]`)?.childElementCount ??
      0) > 0
  return defineUiModule({
    name: 'page-view',
    needs: {},
    apply(shell) {
      let settled = false
      const stopOutcomes = floor.outcomes(() => {
        settled = true
      })
      const timer = setInterval(() => {
        const mark = judgeView(view, {
          signedIn: shell.login.state() === 'signed-in',
          pages: state.slots.items('pages').map(page => page.id),
          drawn: drawn(),
          settled,
          worn: shell.look(),
          fellBack: input.fellBack(),
        })
        if (mark === undefined) return
        clearInterval(timer)
        // One more turn so the page has drawn the frame the mark speaks for.
        setTimeout(() => root.setAttribute(VIEW_MARK, mark), POLL_MS)
      }, POLL_MS)
      return () => {
        clearInterval(timer)
        stopOutcomes()
      }
    },
  })
}
