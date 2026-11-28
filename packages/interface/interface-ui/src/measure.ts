import {
  PART_ROLES,
  type LayerSeen,
  type PartSeen,
  type Structure,
  type Until,
} from '@omne-harness/interface-protocol'
import { PART_ATTRIBUTE } from '@omne-harness/shell-contract'

const MOST = 300
const TEXT = 80
const PART = PART_ATTRIBUTE
const LAYERS = PART_ROLES.map(role => `[role="${role}"]`).join(',')

export type MeasureOptions = Readonly<{ part?: string; page?: string | null }>

const textOf = (element: Element): string =>
  (element.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, TEXT)

const whole = (value: number): number => Math.max(0, Math.round(value))

const partNamed = (root: Document, name: string): Element | null =>
  [...root.querySelectorAll(`[${PART}]`)].find(each => each.getAttribute(PART) === name) ?? null

/** In the window, not hidden, not of no size, and not covered by something else at its middle. */
function visible(element: Element, width: number, height: number): boolean {
  const box = element.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return false
  if (box.right <= 0 || box.bottom <= 0 || box.left >= width || box.top >= height) return false
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  if (style?.visibility === 'hidden' || style?.display === 'none' || style?.opacity === '0')
    return false
  const hit = element.ownerDocument.elementFromPoint?.(
    box.left + box.width / 2,
    box.top + box.height / 2,
  )
  return hit === null || hit === undefined || element.contains(hit) || hit.contains(element)
}

function labelOf(element: Element): string {
  const named = element.getAttribute('aria-label')
  if (named !== null) return named
  const by = element.getAttribute('aria-labelledby')
  const label = by === null ? null : element.ownerDocument.getElementById(by)
  return label === null ? '' : textOf(label)
}

/** What is drawn now, read only: each part with its text and box, and each dialog, alert or menu open on top. */
export function measure(root: Document, options: MeasureOptions = {}): Structure {
  const view = root.defaultView
  const width = whole(view?.innerWidth ?? 0)
  const height = whole(view?.innerHeight ?? 0)
  const scope = options.part === undefined ? root.body : partNamed(root, options.part)
  const found =
    scope === null
      ? []
      : [...(scope.hasAttribute(PART) ? [scope] : []), ...scope.querySelectorAll(`[${PART}]`)]
  const listed = found.slice(0, MOST)
  const parts = listed.map((element): PartSeen => {
    const box = element.getBoundingClientRect()
    const parent = element.parentElement?.closest(`[${PART}]`) ?? null
    const index = parent === null ? -1 : listed.indexOf(parent)
    return {
      part: element.getAttribute(PART) ?? '',
      text: textOf(element),
      box: { x: whole(box.left), y: whole(box.top), w: whole(box.width), h: whole(box.height) },
      visible: visible(element, width, height),
      within: index < 0 ? null : index,
    }
  })
  const layers = [...root.querySelectorAll(LAYERS)]
    .filter(element => element.closest('[hidden]') === null)
    .map(
      (element): LayerSeen => ({
        role: element.getAttribute('role') as LayerSeen['role'],
        label: labelOf(element),
        text: textOf(element),
      }),
    )
    .filter(layer => layer.text !== '' || layer.label !== '')
  return {
    page: options.page ?? null,
    width,
    height,
    parts,
    layers,
    more: found.length - listed.length,
  }
}

const meets = (root: Document, until: Until): boolean => {
  const element = partNamed(root, until.part)
  return element !== null && (until.text === undefined || textOf(element).includes(until.text))
}

/** Waits, without touching the page, until the part is drawn with its text, or the seconds run out: whether it came. */
export function waitFor(root: Document, until: Until, signal: AbortSignal): Promise<boolean> {
  if (meets(root, until)) return Promise.resolve(true)
  return new Promise(resolve => {
    const done = (met: boolean): void => {
      observer.disconnect()
      clearTimeout(timer)
      signal.removeEventListener('abort', stop)
      resolve(met)
    }
    const stop = (): void => done(false)
    const observer = new MutationObserver(() => {
      if (meets(root, until)) done(true)
    })
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
    const timer = setTimeout(stop, until.seconds * 1000)
    signal.addEventListener('abort', stop, { once: true })
  })
}
