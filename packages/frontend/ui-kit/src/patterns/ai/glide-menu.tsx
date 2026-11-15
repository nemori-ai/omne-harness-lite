import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '../../lib/utils.ts'

interface Box {
  readonly top: number
  readonly height: number
}

const ROW = '[data-glide-row]'

const SELECTED = '[data-glide-row][data-selected="true"]'

function boxOf(host: HTMLElement, row: HTMLElement): Box {
  if (row.offsetParent === host) return { top: row.offsetTop, height: row.offsetHeight }
  const hostBox = host.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  return { top: rowBox.top - hostBox.top, height: rowBox.height }
}

const sameBox = (a: Box | null, b: Box | null): boolean =>
  a === b || (a !== null && b !== null && a.top === b.top && a.height === b.height)

export function GlideMenu({
  children,
  className,
  highlightClassName = 'rounded-control bg-hover',
  selectedClassName = 'rounded-control bg-selected',
  activeId,
}: {
  readonly children: React.ReactNode
  readonly className?: string

  readonly highlightClassName?: string

  readonly selectedClassName?: string

  readonly activeId?: string | undefined
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const standingOn = useRef<HTMLElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  const [selected, setSelected] = useState<{
    readonly box: Box
    readonly shown: boolean
    readonly motion: 'none' | 'glide' | 'fade'
  } | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])

  const measure = useCallback((row: HTMLElement | null): void => {
    const host = container.current
    if (host === null || row === null || !host.contains(row)) {
      setBox(null)
      return
    }
    setBox(boxOf(host, row))
  }, [])

  const measureSelected = useCallback((glide: boolean): void => {
    const host = container.current
    const row = host?.querySelector<HTMLElement>(SELECTED) ?? null
    const next = host === null || row === null ? null : boxOf(host, row)
    const moves = glide && mounted.current
    setSelected(current => {
      if (next === null)
        return current === null || !current.shown
          ? current
          : { box: current.box, shown: false, motion: moves ? 'fade' : 'none' }
      if (current !== null && current.shown && sameBox(current.box, next)) return current
      return {
        box: next,
        shown: true,
        motion: !moves ? 'none' : current !== null && current.shown ? 'glide' : 'fade',
      }
    })
  }, [])

  const moveTo = useCallback(
    (target: EventTarget | null): void => {
      const row = target instanceof Element ? target.closest<HTMLElement>(ROW) : null
      if (row === null) return
      standingOn.current = row
      measure(row)
    },
    [measure],
  )

  const hide = useCallback((): void => {
    standingOn.current = null
    setBox(null)
  }, [])

  useLayoutEffect(() => {
    if (activeId === undefined) return
    const host = container.current
    const named = document.getElementById(activeId)
    const row = host !== null && named !== null && host.contains(named) ? named : null
    standingOn.current = row
    if (host === null || row === null) return
    const top = row.getBoundingClientRect().top - host.getBoundingClientRect().top
    const height = row.getBoundingClientRect().height
    setBox(current =>
      current !== null && current.top === top && current.height === height
        ? current
        : { top, height },
    )
  }, [activeId, children])

  useLayoutEffect(() => measureSelected(true), [measureSelected, children])

  useEffect(() => {
    const host = container.current
    if (host === null) return undefined
    const remeasure = (): void => {
      measure(standingOn.current)
      measureSelected(false)
    }
    const observer = new ResizeObserver(remeasure)
    observer.observe(host)
    host.addEventListener('scroll', remeasure)
    window.addEventListener('resize', remeasure)
    return () => {
      observer.disconnect()
      host.removeEventListener('scroll', remeasure)
      window.removeEventListener('resize', remeasure)
    }
  }, [measure, measureSelected])

  return (
    <div
      ref={container}
      data-glide-menu=""
      className={cn('relative', className)}
      onPointerOver={event => moveTo(event.target)}
      onPointerLeave={() => {
        if (container.current?.contains(document.activeElement) === true)
          moveTo(document.activeElement)
        else if (activeId === undefined) hide()
      }}
      onFocusCapture={event => moveTo(event.target)}
      onBlurCapture={event => {
        if (
          event.relatedTarget instanceof Node &&
          container.current?.contains(event.relatedTarget) === true
        )
          return
        hide()
      }}
    >
      <span
        aria-hidden="true"
        data-glide-highlight=""
        className={cn('pointer-events-none absolute inset-x-0', highlightClassName)}
        style={{
          top: 0,
          transform: `translateY(${box?.top ?? 0}px)`,
          height: box?.height ?? 0,
          opacity: box === null ? 0 : 1,
          transition:
            'transform var(--omne-motion-state) var(--omne-motion-ease-enter), opacity var(--omne-motion-feedback) var(--omne-motion-ease)',
        }}
      />
      <span
        aria-hidden="true"
        data-glide-highlight="selected"
        data-shown={selected?.shown === true}
        className={cn('pointer-events-none absolute inset-x-0', selectedClassName)}
        style={{
          top: 0,
          transform: `translateY(${selected?.box.top ?? 0}px)`,
          height: selected?.box.height ?? 0,
          opacity: selected?.shown === true ? 1 : 0,
          transition:
            selected?.motion === 'glide'
              ? 'transform var(--omne-motion-state) var(--omne-motion-ease-enter)'
              : selected?.motion === 'fade'
                ? 'opacity var(--omne-motion-state) var(--omne-motion-ease)'
                : 'none',
        }}
      />
      {children}
    </div>
  )
}
