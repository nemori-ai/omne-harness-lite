// Follow the bottom while new content arrives, unless the person scrolled up to read. Adapted from
// super-assistant `src/desktop/src/renderer/src/conversation/scroll.ts` (`isNearBottom`): the
// decision is a pure function of the scroll geometry.
import { useCallback, useLayoutEffect, useRef } from 'react'

const NEAR_BOTTOM_PX = 32

export type ScrollGeometry = Readonly<{
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}>

export function isNearBottom(geometry: ScrollGeometry): boolean {
  return geometry.scrollHeight - geometry.scrollTop - geometry.clientHeight <= NEAR_BOTTOM_PX
}

/** Returns the ref for the scroller and its scroll handler; `changes` are what can grow. */
export function useFollowBottom(...changes: readonly unknown[]) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const pinned = useRef(true)
  const onScroll = useCallback(() => {
    if (scroller.current !== null) pinned.current = isNearBottom(scroller.current)
  }, [])
  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current) element.scrollTop = element.scrollHeight
  }, changes)
  return { scroller, onScroll }
}
