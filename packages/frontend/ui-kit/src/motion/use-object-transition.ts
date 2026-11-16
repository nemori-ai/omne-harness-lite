import { useCallback } from 'react'
import { flushSync } from 'react-dom'

import { useReducedMotion } from './motion.ts'

export type ObjectPart = 'cover' | 'title' | 'surface'

export const objectPart = (part: ObjectPart): { readonly 'data-object-part': ObjectPart } => ({
  'data-object-part': part,
})
export const objectView = (identity: string): { readonly 'data-object-view': string } => ({
  'data-object-view': identity,
})

let journey = 0
const travelling = (root: Element | null, on: boolean): void => {
  if (root === null) return
  const parts = [root, ...root.querySelectorAll('[data-object-part]')].filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.dataset['objectPart'] !== undefined,
  )
  for (const part of parts) {
    part.style.viewTransitionName = on ? `omne-object-${part.dataset['objectPart']}` : ''
  }
}

export function useObjectTransition(): (
  identity: string,
  source: Element | null,
  update: () => void,
) => void {
  const reduced = useReducedMotion()
  return useCallback(
    (identity, source, update) => {
      const own =
        source instanceof HTMLElement &&
        (source.dataset['objectPart'] !== undefined ||
          source.querySelector('[data-object-part]') !== null)
      const from = own ? source : (source?.closest('[data-control="card"]') ?? source)
      if (
        reduced ||
        document.hidden ||
        from === null ||
        typeof document.startViewTransition !== 'function'
      ) {
        update()
        return
      }
      const current = ++journey
      travelling(from, true)
      let to: Element | null = null
      const transition = document.startViewTransition(() => {
        travelling(from, false)
        flushSync(update)
        to = document.querySelector(`[data-object-view="${CSS.escape(identity)}"]`)
        travelling(to, true)
      })
      const settle = (): void => {
        if (current !== journey) return
        travelling(from, false)
        travelling(to, false)
      }

      transition.ready.catch(() => undefined)
      void transition.finished.then(settle, settle)
    },
    [reduced],
  )
}
