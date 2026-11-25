import { PART_ATTRIBUTE } from '@omne-harness/shell-contract'

const FOCUSABLE = 'input, textarea, select, button, [contenteditable="true"], [tabindex]'

type Selection = Readonly<{
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}>

/** Where the focus is, told by the part it is in: the element itself is drawn anew when a drawing changes. */
export type HeldFocus = Readonly<{
  part: string
  /** -1 when the focus is on the element that carries the part; else its place among what can take focus there. */
  index: number
  tag: string
  selection: Selection | null
}>

type Field = HTMLInputElement | HTMLTextAreaElement

const isField = (node: Element): node is Field =>
  node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement

/** A field's selection; null where its kind has none (a checkbox, a button). */
function selectionOf(node: Element): Selection | null {
  if (!isField(node) || node.selectionStart === null || node.selectionEnd === null) return null
  return {
    start: node.selectionStart,
    end: node.selectionEnd,
    direction: node.selectionDirection ?? 'none',
  }
}

export function heldFocus(doc: Document): HeldFocus | null {
  const node = doc.activeElement
  if (node === null) return null
  const host = node.closest(`[${PART_ATTRIBUTE}]`)
  if (host === null) return null
  return {
    part: String(host.getAttribute(PART_ATTRIBUTE)),
    index: [...host.querySelectorAll(FOCUSABLE)].indexOf(node),
    tag: node.tagName,
    selection: selectionOf(node),
  }
}

/** The element in the same place of the same part, compared by value: a drawing writes the name, so it is not put in a selector. */
function placeOf(doc: Document, held: HeldFocus): HTMLElement | null {
  const host = [...doc.querySelectorAll(`[${PART_ATTRIBUTE}]`)].find(
    each => each.getAttribute(PART_ATTRIBUTE) === held.part,
  )
  const place = held.index < 0 ? host : host?.querySelectorAll(FOCUSABLE)[held.index]
  return place instanceof HTMLElement && place.tagName === held.tag ? place : null
}

/** Gives the focus back only where the change left it on nothing: an element that kept it, or took it since, keeps it. */
export function giveBack(doc: Document, held: HeldFocus): void {
  if (doc.activeElement !== null && doc.activeElement !== doc.body) return
  const place = placeOf(doc, held)
  if (place === null) return
  place.focus({ preventScroll: true })
  if (held.selection === null || !isField(place) || selectionOf(place) === null) return
  const { length } = place.value
  const { start, end, direction } = held.selection
  place.setSelectionRange(Math.min(start, length), Math.min(end, length), direction)
}
