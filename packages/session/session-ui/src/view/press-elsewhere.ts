import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/** A press outside the bubble and its control folds it; inside is judged by the React tree, so a portal it opened counts. */
export function usePressElsewhere(
  on: boolean,
  control: RefObject<HTMLElement | null>,
  fold: () => void,
): () => void {
  const inside = useRef(false)
  const folding = useRef(fold)
  useLayoutEffect(() => {
    folding.current = fold
  })
  useEffect(() => {
    if (!on) return undefined
    const begin = (): void => {
      inside.current = false
    }
    const end = (event: PointerEvent): void => {
      if (inside.current || event.composedPath().some(node => node === control.current)) return
      folding.current()
    }
    document.addEventListener('pointerdown', begin, true)
    document.addEventListener('pointerdown', end)
    return () => {
      document.removeEventListener('pointerdown', begin, true)
      document.removeEventListener('pointerdown', end)
    }
  }, [on, control])
  return useCallback(() => {
    inside.current = true
  }, [])
}
