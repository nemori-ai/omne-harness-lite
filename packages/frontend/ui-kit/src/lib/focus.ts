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
export function moveRegion(direction: 'next' | 'previous'): boolean {
  const modal = blockingOverlay()
  if (modal) return false
  const regions = [...document.querySelectorAll<HTMLElement>(REGION)].filter(visible)
  const current = document.activeElement?.closest(REGION)
  const index = regions.findIndex(region => region === current)
  if (!regions.length) return false
  const next = regions[(index + (direction === 'next' ? 1 : -1) + regions.length) % regions.length]!
  const held = remembered.get(next)
  if (
    (!held || !visible(held) || held.closest(REGION) !== next) &&
    next.hasAttribute('data-focus-surface')
  ) {
    focusSurface(next)
    return next.contains(document.activeElement)
  }
  const first = [...next.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
    node => node.tabIndex >= 0 && visible(node) && node.closest(REGION) === next,
  )
  const target = held && visible(held) && held.closest(REGION) === next ? held : (first ?? next)
  target.focus({ preventScroll: true })
  return document.activeElement === target
}
export function currentRegion(): HTMLElement | undefined {
  return (
    document.activeElement?.closest<HTMLElement>(REGION) ??
    document.querySelector<HTMLElement>('#shell-content') ??
    undefined
  )
}
export function navigateWithin(key: 'j' | 'k' | 'gg' | 'G' | '/'): boolean {
  const region = currentRegion()
  if (!region) return false
  if (key === '/') {
    const search = [
      ...region.querySelectorAll<HTMLElement>('[data-keyboard-search],input[type="search"]'),
    ].find(visible)
    search?.focus()
    return search !== undefined
  }
  const reading = region.querySelector<HTMLElement>('[data-keyboard-reading]')
  if (reading && visible(reading) && !document.activeElement?.closest('[data-keyboard-list]')) {
    reading.focus({ preventScroll: true })
    if (key === 'gg' || key === 'G')
      reading.scrollTo({ top: key === 'gg' ? 0 : reading.scrollHeight, behavior: 'instant' })
    else reading.scrollBy({ top: key === 'j' ? 80 : -80, behavior: 'instant' })
    return true
  }
  const list = document.activeElement?.closest('[data-keyboard-list]') ?? region
  const items = [...list.querySelectorAll<HTMLElement>('[data-keyboard-item]')].filter(visible)
  if (!items.length) return false
  const index = items.findIndex(
    item => item === document.activeElement || item.contains(document.activeElement),
  )
  const next =
    key === 'gg'
      ? 0
      : key === 'G'
        ? items.length - 1
        : Math.min(items.length - 1, Math.max(0, index + (key === 'j' ? 1 : -1)))
  items[next]!.focus()
  items[next]!.scrollIntoView?.({ block: 'nearest' })
  return true
}
