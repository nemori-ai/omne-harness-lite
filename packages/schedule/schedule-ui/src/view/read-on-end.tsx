import { useEffect, useEffectEvent, useRef, type JSX } from 'react'

/** The scroller an element sits in: its nearest ancestor that scrolls on the block axis, or else the viewport. */
function scrollerOf(element: Element): Element | null {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

/** In place of 「更多」 (A4): once the end of the list comes into view, the page after the cursor `next` is asked for,
 * once, so nothing is asked again while that read is under way. Nothing is drawn when no page comes after. */
export function ReadOnEnd({
  next,
  onEnd,
}: Readonly<{ next: string | null; onEnd: (next: string) => void }>): JSX.Element | null {
  const end = useRef<HTMLDivElement>(null)
  const reach = useEffectEvent(onEnd)
  useEffect(() => {
    const element = end.current
    if (next === null || element === null) return undefined
    let asked = false
    const observer = new IntersectionObserver(
      entries => {
        if (asked || !entries.some(entry => entry.isIntersecting)) return
        asked = true
        reach(next)
      },
      { root: scrollerOf(element) },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [next])
  return next === null ? null : <div ref={end} aria-hidden="true" data-list-end="" />
}
