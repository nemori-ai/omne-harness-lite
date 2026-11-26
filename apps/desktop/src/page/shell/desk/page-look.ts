import { FIGURE_SIZE, SIZE_TIERS } from '@omne-harness/ui-kit'
import type { Look } from '../../desk/scene.ts'
import type { Clock } from './window-look.ts'

const REDUCED = '(prefers-reduced-motion: reduce)'

export const PAGE_CLOCK: Clock = {
  now: () =>
    /* wall-clock: operation-timing -- spaces the `window` questions apart; compared only with itself */ performance.now(),
  later(ms, run) {
    const timer = setTimeout(run, ms)
    return () => clearTimeout(timer)
  },
}

export function pageLook(): Look {
  const root = document.documentElement
  const size = SIZE_TIERS.find(tier => tier === root.dataset['size']) ?? 'medium'
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia(REDUCED).matches
  return { theme: root.dataset['theme'] === 'dark' ? 'dark' : 'light', size, reduced }
}

export function pageFigureSize(): number {
  const style = getComputedStyle(document.documentElement).getPropertyValue('--omne-size')
  const factor = Number.parseFloat(style)
  return FIGURE_SIZE * (Number.isFinite(factor) ? factor : 1)
}

/** Whatever on the page may bring a seat or change the look: its nodes, the root's attributes, the system's motion. */
export function watchPage(changed: () => void): () => void {
  const observer = new MutationObserver(changed)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'inert', 'data-width', 'data-theme', 'data-size'],
  })
  const motion = typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED) : null
  motion?.addEventListener('change', changed)
  window.addEventListener('resize', changed)
  return () => {
    observer.disconnect()
    motion?.removeEventListener('change', changed)
    window.removeEventListener('resize', changed)
  }
}
