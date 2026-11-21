import { vi } from 'vitest'

type Watch = { callback: IntersectionObserverCallback; root: Element | Document | null }

/**
 * A stand-in for `IntersectionObserver`, which lays nothing out here: it keeps what is watched and from which root,
 * and says an element came into view, or left it, only when the test says so.
 */
export function stubInView() {
  const watched = new Map<Element, Watch>()
  class StandIn {
    readonly root: Element | Document | null
    readonly rootMargin = '0px'
    readonly thresholds = [0]
    readonly #callback: IntersectionObserverCallback
    readonly #mine = new Set<Element>()
    constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
      this.#callback = callback
      this.root = options.root ?? null
    }
    observe(element: Element): void {
      this.#mine.add(element)
      watched.set(element, { callback: this.#callback, root: this.root })
    }
    unobserve(element: Element): void {
      this.#mine.delete(element)
      watched.delete(element)
    }
    disconnect(): void {
      for (const element of this.#mine) watched.delete(element)
      this.#mine.clear()
    }
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', StandIn)
  const say = (isIntersecting: boolean) => {
    for (const [target, { callback }] of watched)
      callback(
        [{ target, isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
  }
  return {
    /** Every element watched now came into view. */
    enter: () => say(true),
    /** Every element watched now is out of view. */
    leave: () => say(false),
    /** The elements watched now, each with the root it is watched from. */
    watched: () => [...watched].map(([element, { root }]) => ({ element, root })),
  }
}
