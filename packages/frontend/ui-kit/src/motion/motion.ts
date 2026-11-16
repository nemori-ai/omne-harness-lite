import {
  createElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
  type RefCallback,
  type RefObject,
} from 'react'

const preference = '(prefers-reduced-motion: reduce)'
const reducedSnapshot = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(preference).matches
const subscribe = (notify: () => void): (() => void) => {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(preference)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedSnapshot, () => false)
}

interface Cue {
  readonly frames: readonly Keyframe[]
  readonly duration: '--omne-motion-enter' | '--omne-motion-state' | '--omne-motion-feedback'
  readonly fallback: number
}

const RISE: Cue = {
  frames: [
    { opacity: 0, translate: '0 4px' },
    { opacity: 1, translate: '0 0' },
  ],
  duration: '--omne-motion-enter',
  fallback: 240,
}
const SETTLE: Cue = {
  frames: [{ opacity: 0.6 }, { opacity: 1 }],
  duration: '--omne-motion-state',
  fallback: 180,
}
const FADE: Cue = {
  frames: [{ opacity: 0 }, { opacity: 1 }],
  duration: '--omne-motion-feedback',
  fallback: 120,
}
const slide = (direction: 'forward' | 'backward'): Cue => ({
  frames: [
    { opacity: 0, translate: `${direction === 'backward' ? -12 : 12}px 0` },
    { opacity: 1, translate: '0 0' },
  ],
  duration: '--omne-motion-enter',
  fallback: 240,
})

function milliseconds(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed * (value.trim().endsWith('ms') ? 1 : 1000) : fallback
}

function play(node: HTMLElement, cue: Cue): (() => void) | undefined {
  if (document.hidden || typeof node.animate !== 'function') return undefined
  const style = getComputedStyle(node)
  if (
    node.getClientRects().length === 0 ||
    style.visibility === 'hidden' ||
    style.display === 'none'
  )
    return undefined
  let animation: Animation
  try {
    animation = node.animate([...cue.frames], {
      duration: milliseconds(style.getPropertyValue(cue.duration), cue.fallback),
      easing:
        style.getPropertyValue('--omne-motion-ease-enter').trim() || 'cubic-bezier(.16, 1, .3, 1)',
    })
  } catch {
    return undefined
  }
  const cancelWhenHidden = (): void => {
    if (document.hidden) animation.cancel()
  }
  document.addEventListener('visibilitychange', cancelWhenHidden)
  return () => {
    document.removeEventListener('visibilitychange', cancelWhenHidden)
    animation.cancel()
  }
}

let surfaceArrivedAt =
  /* wall-clock: operation-timing -- Decide whether content arrived with its surface; presentation only. */ performance.now()

export function markSurfaceArrival(): void {
  surfaceArrivedAt =
    /* wall-clock: operation-timing -- Decide whether content arrived with its surface; presentation only. */ performance.now()
}

export interface MotionCueOptions {
  readonly kind: 'view' | 'panel' | 'content'
  readonly initial?: boolean
  readonly disabled?: boolean
  readonly direction?: 'forward' | 'backward'
}

export function useMotionCue(
  ref: RefObject<HTMLElement | null>,
  key: string | number | boolean | null,
  { kind, initial = false, disabled = false, direction = 'forward' }: MotionCueOptions,
): void {
  const reduced = useReducedMotion()
  const previous = useRef<{ key: typeof key } | null>(null)
  useLayoutEffect(() => {
    const changed = previous.current === null ? initial : !Object.is(previous.current.key, key)
    previous.current = { key }
    if (!changed) return
    markSurfaceArrival()
    const node = ref.current
    if (disabled || node === null) return
    return play(node, reduced ? FADE : kind === 'panel' ? slide(direction) : RISE)
  }, [ref, key, kind, initial, disabled, direction, reduced])
}

export function useArrival(
  ref: RefObject<HTMLElement | null>,
  { still = false }: { readonly still?: boolean | undefined } = {},
): void {
  const [stillOnMount] = useState(still)
  useLayoutEffect(() => {
    const node = ref.current
    if (stillOnMount || node === null) return
    let cancel: (() => void) | undefined
    let gone = false

    queueMicrotask(() => {
      if (gone) return
      const enter = milliseconds(
        getComputedStyle(node).getPropertyValue('--omne-motion-enter'),
        RISE.fallback,
      )
      if (
        /* wall-clock: operation-timing -- Decide whether content arrived with its surface; presentation only. */ performance.now() -
          surfaceArrivedAt <=
        enter
      )
        return
      cancel = play(node, reducedSnapshot() ? FADE : RISE)
    })
    return () => {
      gone = true
      cancel?.()
    }
  }, [ref, stillOnMount])
}

export function Arrive({
  still,
  className,
  children,
  ...rest
}: {
  readonly still?: boolean
  readonly className?: string
  readonly children?: React.ReactNode
  readonly 'data-testid'?: string
}): React.JSX.Element {
  const node = useRef<HTMLDivElement>(null)
  useArrival(node, { still })

  return createElement('div', { ref: node, className, ...rest }, children)
}

export function useSettleCue(
  ref: RefObject<HTMLElement | null>,
  key: string | number | boolean | null,
  { disabled = false }: { readonly disabled?: boolean } = {},
): void {
  const previous = useRef<{ key: typeof key } | null>(null)
  useLayoutEffect(() => {
    const changed = previous.current !== null && !Object.is(previous.current.key, key)
    previous.current = { key }
    const node = ref.current
    if (!changed || disabled || node === null) return
    return play(node, SETTLE)
  }, [ref, key, disabled])
}

export function usePresenceInert<T extends HTMLElement>(forwardedRef?: Ref<T>): RefCallback<T> {
  return useCallback(
    (node: T | null) => {
      const cleanupRef = typeof forwardedRef === 'function' ? forwardedRef(node) : undefined
      if (forwardedRef !== undefined && forwardedRef !== null && typeof forwardedRef !== 'function')
        forwardedRef.current = node
      if (node === null) return
      const sync = (): void => {
        node.inert = node.dataset['state'] === 'closed'
      }
      sync()
      const observer = new MutationObserver(sync)
      observer.observe(node, { attributes: true, attributeFilter: ['data-state'] })
      return () => {
        observer.disconnect()
        if (typeof cleanupRef === 'function') cleanupRef()
        else if (typeof forwardedRef === 'function') forwardedRef(null)
        else if (forwardedRef !== undefined && forwardedRef !== null) forwardedRef.current = null
      }
    },
    [forwardedRef],
  )
}
