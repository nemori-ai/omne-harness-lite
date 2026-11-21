import { vi } from 'vitest'

type Rect = Readonly<{ left: number; top: number; width: number; height: number }>

const rectOf = ({ left, top, width, height }: Rect): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect

/**
 * The page has no layout here: the conversation page's own width is what the test sets, and a resize is told
 * to every resize observer at once. `boxes` gives the boxes of the elements a selector matches.
 */
export function stubRoom(initial: number, boxes: ReadonlyMap<string, Rect> = new Map()) {
  let width = initial
  const observers = new Set<FakeResizeObserver>()
  class FakeResizeObserver {
    readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(): void {
      observers.add(this)
    }
    unobserve(): void {}
    disconnect(): void {
      observers.delete(this)
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('omne-session-page') ? width : 0
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    for (const [selector, box] of boxes) if (this.matches(selector)) return rectOf(box)
    return rectOf({ left: 0, top: 0, width: 0, height: 0 })
  })
  return {
    resize(next: number): void {
      width = next
      for (const observer of Array.from(observers))
        observer.callback([], observer as unknown as ResizeObserver)
    },
  }
}
