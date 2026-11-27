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

/** Nothing is said before everything the tenant loads has settled: a page may still be about to start reading. */
export function judgeView(view: ViewAsked, facts: ViewFacts): ViewMark | undefined {
  if (facts.fellBack) return 'no-skin'
  if (!facts.settled) return undefined
  const wanted = view.look.kind === 'skin' ? view.look.name : undefined
  if (!facts.pages.includes(view.page)) return 'no-page'
  if (facts.worn !== wanted) return 'no-skin'
  return facts.signedIn && facts.drawn ? 'ready' : undefined
}

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
/** How long the page must not change, nor be so busy that a look comes late, with nothing on it saying it is loading. */
export const REST_MS = 300
const LATE_MS = 3 * POLL_MS
const clock = (): number =>
  /* wall-clock: operation-timing -- how long the drawing page has been still or busy; compared only with itself */ performance.now()
const LOADING = '.omne-loading-state, [aria-busy="true"]'

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
  let changed = clock()
  let looked = changed
  const changes = new MutationObserver(() => {
    changed = clock()
  })
  const atRest = (): boolean => {
    const now = clock()
    if (now - looked > LATE_MS) changed = now
    looked = now
    const page = root.ownerDocument.querySelector(`[data-page="${CSS.escape(view.page)}"]`)
    if (page === null || page.childElementCount === 0) return false
    return page.querySelector(LOADING) === null && now - changed >= REST_MS
  }
  return defineUiModule({
    name: 'page-view',
    needs: {},
    apply(shell) {
      let settled = false
      changes.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      })
      const stopOutcomes = floor.outcomes(() => {
        settled = true
      })
      const timer = setInterval(() => {
        const mark = judgeView(view, {
          signedIn: shell.login.state() === 'signed-in',
          pages: state.slots.items('pages').map(page => page.id),
          drawn: atRest(),
          settled,
          worn: shell.look(),
          fellBack: input.fellBack(),
        })
        if (mark === undefined) return
        clearInterval(timer)
        changes.disconnect()
        root.setAttribute(VIEW_MARK, mark)
      }, POLL_MS)
      return () => {
        clearInterval(timer)
        changes.disconnect()
        stopOutcomes()
      }
    },
  })
}
