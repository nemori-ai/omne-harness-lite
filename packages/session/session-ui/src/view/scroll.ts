import { useCallback, useLayoutEffect, useRef } from 'react'

const NEAR_BOTTOM_PX = 32

export type ScrollGeometry = Readonly<{
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}>

type ScrollExtent = Pick<ScrollGeometry, 'scrollHeight' | 'clientHeight'>

export function isNearBottom(geometry: ScrollGeometry): boolean {
  return geometry.scrollHeight - geometry.scrollTop - geometry.clientHeight <= NEAR_BOTTOM_PX
}

function staysAtEnd(followed: ScrollExtent | null, now: ScrollGeometry): boolean {
  if (isNearBottom(now)) return true
  return followed !== null && isNearBottom({ ...followed, scrollTop: now.scrollTop })
}

export function useFollowBottom(...changes: readonly unknown[]) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const pinned = useRef(true)
  const followed = useRef<ScrollExtent | null>(null)
  const follow = useCallback(() => {
    const element = scroller.current
    if (element === null || element.clientHeight === 0) return
    if (pinned.current) element.scrollTop = element.scrollHeight
    followed.current = { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }
  }, [])
  const onScroll = useCallback(() => {
    const element = scroller.current
    if (element !== null) pinned.current = staysAtEnd(followed.current, element)
  }, [])
  useLayoutEffect(follow, changes)
  useLayoutEffect(() => {
    const element = scroller.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(follow)
    observer.observe(element)
    return () => observer.disconnect()
  }, [follow])
  return { scroller, onScroll }
}
