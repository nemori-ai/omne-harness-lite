import { useEffect, useEffectEvent, useRef } from 'react'

/** The scroller an element sits in: its nearest ancestor that scrolls on the block axis, or else the viewport. */
function scrollerOf(element: Element): Element | null {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

// In place of 「更多」 (A4): once the end of the list comes into view, the page after `page` is read, once per page,
// so nothing is asked again while a read is under way. `page` is null when no page comes after the one shown.
export function ReadOnEnd({
  page,
  read,
}: {
  readonly page: object | null
  readonly read: () => void
}) {
  const end = useRef<HTMLDivElement>(null)
  const onEnd = useEffectEvent(read)
  useEffect(() => {
    const element = end.current
    if (page === null || element === null) return undefined
    let asked = false
    const observer = new IntersectionObserver(
      entries => {
        if (asked || !entries.some(entry => entry.isIntersecting)) return
        asked = true
        onEnd()
      },
      { root: scrollerOf(element) },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [page])
  return page === null ? null : <div ref={end} aria-hidden="true" data-list-end="" />
}
