const REGION = '[data-keyboard-region]'
const CONTROL =
  'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="combobox"],[role="listbox"],[role="menu"],[role="menubar"],[role="slider"],[role="spinbutton"],[role="grid"],[role="tablist"],[role="tree"],[role="radiogroup"]'
const FOCUSABLE = 'a[href],button,input,textarea,select,iframe,[tabindex]'
const remembered = new WeakMap<HTMLElement, HTMLElement>()
function visible(element: HTMLElement): boolean {
  if (
    !element.isConnected ||
    element.closest('[hidden],[inert],[aria-hidden="true"]') ||
    element.matches(':disabled,[aria-disabled="true"]')
  )
    return false
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}
export function ownsTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(CONTROL) !== null
}

export function focusSurface(surface: HTMLElement, preferred?: HTMLElement | null): void {
  const marked = [...surface.querySelectorAll<HTMLElement>('[data-initial-focus]')].find(visible)
  const editor = [
    ...surface.querySelectorAll<HTMLElement>(
      'textarea:not([readonly]),input:not([readonly]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]),select,[contenteditable="true"]',
    ),
  ].find(visible)
  const target = preferred && visible(preferred) ? preferred : (marked ?? editor ?? surface)
  target.focus({ preventScroll: true })
}

export function blockingOverlay(): HTMLElement | undefined {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-keyboard-modal],[aria-modal="true"],[role="alertdialog"],[role="menu"],[role="listbox"]',
    ),
  ]
    .filter(visible)
    .at(-1)
}
export function rememberFocus(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return
  const region = target.closest<HTMLElement>(REGION)
  if (region) remembered.set(region, target)
}
function heldIn(region: HTMLElement): HTMLElement | undefined {
  const held = remembered.get(region)
  return held && visible(held) && held.closest(REGION) === region ? held : undefined
}

function firstFocusable(region: HTMLElement): HTMLElement | undefined {
  return [...region.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
    node => node.tabIndex >= 0 && visible(node) && node.closest(REGION) === region,
  )
}

function neighbourRegion(direction: 'next' | 'previous'): HTMLElement | undefined {
  const regions = [...document.querySelectorAll<HTMLElement>(REGION)].filter(visible)
  if (!regions.length) return undefined
  const current = document.activeElement?.closest(REGION)
  const index = regions.findIndex(region => region === current)
  if (index === -1) return direction === 'next' ? regions[0] : regions.at(-1)
  return regions[(index + (direction === 'next' ? 1 : -1) + regions.length) % regions.length]
}

export function moveRegion(direction: 'next' | 'previous'): boolean {
  if (blockingOverlay()) return false
  const next = neighbourRegion(direction)
  if (next === undefined) return false
  const held = heldIn(next)
  if (held === undefined && next.hasAttribute('data-focus-surface')) {
    focusSurface(next)
    return next.contains(document.activeElement)
  }
  const target = held ?? firstFocusable(next) ?? next
  target.focus({ preventScroll: true })
  return document.activeElement === target
}
export function currentRegion(fallback?: HTMLElement | null): HTMLElement | undefined {
  return document.activeElement?.closest<HTMLElement>(REGION) ?? fallback ?? undefined
}
type NavigationKey = 'j' | 'k' | 'gg' | 'G' | '/'

function focusSearch(region: HTMLElement): boolean {
  const search = [
    ...region.querySelectorAll<HTMLElement>('[data-keyboard-search],input[type="search"]'),
  ].find(visible)
  search?.focus()
  return search !== undefined
}

function scrollReading(reading: HTMLElement, key: NavigationKey): void {
  reading.focus({ preventScroll: true })
  if (key === 'gg' || key === 'G') {
    reading.scrollTo({ top: key === 'gg' ? 0 : reading.scrollHeight, behavior: 'instant' })
  } else {
    reading.scrollBy({ top: key === 'j' ? 80 : -80, behavior: 'instant' })
  }
}

function targetItem(key: NavigationKey, index: number, count: number): number {
  if (key === 'gg') return 0
  if (key === 'G') return count - 1
  return Math.min(count - 1, Math.max(0, index + (key === 'j' ? 1 : -1)))
}

function stepItems(list: Element, key: NavigationKey): boolean {
  const items = [...list.querySelectorAll<HTMLElement>('[data-keyboard-item]')].filter(visible)
  if (!items.length) return false
  const index = items.findIndex(
    item => item === document.activeElement || item.contains(document.activeElement),
  )
  const next = items[targetItem(key, index, items.length)]!
  next.focus()
  next.scrollIntoView?.({ block: 'nearest' })
  return true
}

export function navigateWithin(key: NavigationKey, fallback?: HTMLElement | null): boolean {
  const region = currentRegion(fallback)
  if (!region) return false
  if (key === '/') return focusSearch(region)
  const reading = region.querySelector<HTMLElement>('[data-keyboard-reading]')
  const inList = document.activeElement?.closest('[data-keyboard-list]')
  if (reading && visible(reading) && !inList) {
    scrollReading(reading, key)
    return true
  }
  return stepItems(inList ?? region, key)
}
