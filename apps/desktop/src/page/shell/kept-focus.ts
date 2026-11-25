import { PART_ATTRIBUTE } from '@omne-harness/shell-contract'

const FOCUSABLE = 'input, textarea, select, button, [contenteditable="true"], [tabindex]'

type Selection = Readonly<{
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}>

/** Where the focus is, told by the part it is in: the element itself is drawn anew when a drawing changes. */
export type HeldFocus = Readonly<{
  node: Element
  part: string
  /** -1 when the focus is on the element that carries the part; else its place among what can take focus there. */
  index: number
  tag: string
  selection: Selection | null
}>

const isField = (node: Element): node is HTMLInputElement | HTMLTextAreaElement =>
  node.tagName === 'TEXTAREA' || node.tagName === 'INPUT'

function selectionOf(node: Element): Selection | null {
  if (!isField(node)) return null
  try {
    const { selectionStart: start, selectionEnd: end, selectionDirection } = node
    if (start === null || end === null) return null
    return { start, end, direction: selectionDirection ?? 'none' }
  } catch {
    return null
  }
}

export function heldFocus(doc: Document): HeldFocus | null {
  const node = doc.activeElement
  if (node === null || node === doc.body) return null
  const host = node.closest(`[${PART_ATTRIBUTE}]`)
  const part = host?.getAttribute(PART_ATTRIBUTE)
  if (host === null || host === undefined || part === null || part === undefined) return null
  const index = host === node ? -1 : [...host.querySelectorAll(FOCUSABLE)].indexOf(node)
  return { node, part, index, tag: node.tagName, selection: selectionOf(node) }
}

const lost = (doc: Document, held: HeldFocus): boolean => {
  if (held.node.isConnected) return false
  const now = doc.activeElement
  return now === null || now === doc.body || now === held.node || !now.isConnected
}

/** Gives the focus back to the element in the same place of the same part, only where the change took it away. */
export function giveBack(doc: Document, held: HeldFocus): void {
  if (!lost(doc, held)) return
  const host = [...doc.querySelectorAll(`[${PART_ATTRIBUTE}]`)].find(
    each => each.getAttribute(PART_ATTRIBUTE) === held.part,
  )
  if (host === undefined) return
  const target = held.index < 0 ? host : (host.querySelectorAll(FOCUSABLE)[held.index] ?? null)
  if (target === null || target.tagName !== held.tag || !(target instanceof HTMLElement)) return
  target.focus({ preventScroll: true })
  if (held.selection === null || !isField(target) || selectionOf(target) === null) return
  const length = target.value.length
  const { start, end, direction } = held.selection
  target.setSelectionRange(Math.min(start, length), Math.min(end, length), direction)
}
