import type { KeyTarget } from './size.ts'

/** A region a person can be in: the sidebar, the main area, a page's side area. */
const REGION = '[data-region]'

function open(region: HTMLElement): boolean {
  return region.isConnected && region.closest('[hidden], [inert]') === null
}

function landOn(region: HTMLElement): void {
  if (region.hasAttribute('tabindex')) {
    region.focus({ preventScroll: true })
    return
  }
  region
    .querySelector<HTMLElement>(
      'a[href], button:not(:disabled), input, textarea, select, [tabindex]',
    )
    ?.focus({ preventScroll: true })
}

/** F6 walks the regions in page order, Shift+F6 back; from outside every region it starts at an end. */
export function moveRegion(direction: 'next' | 'previous', root: Document = document): void {
  const regions = [...root.querySelectorAll<HTMLElement>(REGION)].filter(open)
  if (regions.length === 0) return
  const active = root.activeElement
  const current = active === null ? null : active.closest<HTMLElement>(REGION)
  const at = current === null ? -1 : regions.indexOf(current)
  const step = direction === 'next' ? 1 : -1
  const next =
    at === -1
      ? regions[direction === 'next' ? 0 : regions.length - 1]
      : regions[(at + step + regions.length) % regions.length]
  if (next !== undefined) landOn(next)
}

export function bindRegionKeys(target: KeyTarget, root: Document = document): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'F6' || event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    moveRegion(event.shiftKey ? 'previous' : 'next', root)
  }
  target.addEventListener('keydown', onKey)
  return () => target.removeEventListener('keydown', onKey)
}
