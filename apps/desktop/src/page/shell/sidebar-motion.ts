import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useReducedMotion } from '@omne-harness/ui-kit'

export type SidebarWidth = 'expanded' | 'rail'

const REARRANGED = '.shell-brand-row, .shell-secondary'

export function useSidebarFoldMotion(
  ref: RefObject<HTMLElement | null>,
  width: SidebarWidth,
): {
  readonly ready: boolean
  readonly labels: boolean
  readonly prepare: () => void
} {
  const reduced = useReducedMotion()
  const [ready, setReady] = useState(false)
  const [folding, setFolding] = useState(false)
  const labels = width === 'expanded' || (folding && !reduced)
  const focused = useRef<HTMLElement | null>(null)
  const shown = useRef(labels)

  const prepare = (): void => {
    setReady(true)
    const sidebar = ref.current
    focused.current =
      sidebar?.contains(document.activeElement) === true
        ? (document.activeElement as HTMLElement)
        : null
    setFolding(width === 'expanded' && !reduced && !document.hidden && window.innerWidth >= 768)
  }

  useEffect(() => {
    if (!folding) return undefined
    const shell = ref.current?.parentElement ?? null
    if (shell === null) return undefined
    const ended = (event: TransitionEvent): void => {
      if (event.target === shell && event.propertyName === 'grid-template-columns')
        setFolding(false)
    }
    shell.addEventListener('transitionend', ended)
    shell.addEventListener('transitioncancel', ended)
    const frame = requestAnimationFrame(() => {
      const moving =
        typeof shell.getAnimations === 'function' &&
        shell
          .getAnimations()
          .some(
            animation =>
              'transitionProperty' in animation &&
              animation.transitionProperty === 'grid-template-columns',
          )
      if (!moving) setFolding(false)
    })
    return () => {
      cancelAnimationFrame(frame)
      shell.removeEventListener('transitionend', ended)
      shell.removeEventListener('transitioncancel', ended)
    }
  }, [folding, ref])

  useLayoutEffect(() => {
    if (shown.current === labels) return undefined
    shown.current = labels
    const sidebar = ref.current
    if (sidebar === null) return undefined
    if (focused.current !== null && !focused.current.isConnected)
      sidebar.querySelector<HTMLElement>('.shell-fold')?.focus({ preventScroll: true })
    focused.current = null
    if (reduced || document.hidden || window.innerWidth < 768) return undefined
    const style = getComputedStyle(sidebar)
    const token = style.getPropertyValue('--omne-motion-enter').trim()
    const duration = Number.parseFloat(token) * (token.endsWith('ms') ? 1 : 1000) || 240
    const easing =
      style.getPropertyValue('--omne-motion-ease-enter').trim() || 'cubic-bezier(.16, 1, .3, 1)'
    const running = [...sidebar.querySelectorAll<HTMLElement>(REARRANGED)]
      .filter(region => typeof region.animate === 'function')
      .map(region => region.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing }))
    return () => {
      for (const animation of running) animation.cancel()
    }
  }, [ref, labels, reduced])

  return { ready, labels, prepare }
}
