import { useSyncExternalStore } from 'react'

const SIZE_FACTOR = '--omne-size'

function pageFactor(): number {
  const factor = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(SIZE_FACTOR),
  )
  return Number.isFinite(factor) ? factor : 1
}

function watchSize(changed: () => void): () => void {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-size'] })
  return () => observer.disconnect()
}

export function useSizeFactor(): number {
  return useSyncExternalStore(watchSize, pageFactor)
}
