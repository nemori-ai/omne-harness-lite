import type { CanvasBody, CanvasItemBody } from '@omne-harness/canvas-protocol'
import {
  PaperSpot,
  usePaperAt,
  type PaperBox,
  type PaperPoint,
  type PaperSheet,
  type PaperView,
} from '@omne-harness/ui-kit'
import { useCallback, useEffect, useRef, useState, type JSX, type RefObject } from 'react'
import type { Placed, Spot } from '../model/commands.ts'
import { itemBox, pileBox } from '../model/sheet.ts'
import type { CanvasReference } from '../points.ts'
import type { Dropped } from './intake.tsx'

/** How long a thing pointed out after `no-change` stays marked. */
export const FOUND_MS = 1500

/** Opened from the keyboard, the finder is written this far below the middle of the view, clear of the seat there. */
export const BELOW_MIDDLE = 64

export type Place = (reference: CanvasReference, near: Spot) => Promise<Placed>

type Looking = Readonly<{ view: PaperView; look: (next: PaperView) => void }>

type Opened = Readonly<{ at: PaperPoint }>

const middle = (box: PaperBox): PaperPoint => ({
  x: Math.round(box.x + box.width / 2),
  y: Math.round(box.y + box.height / 2),
})

function boxOf(canvas: CanvasBody, sheet: PaperSheet, item: CanvasItemBody): PaperBox {
  const pile = canvas.piles.find(one => one.id === item.pile)
  return pile === undefined ? itemBox(item, sheet) : pileBox(pile, sheet)
}

/** The finder, the files dropped, and the thing pointed out: what the sheet draws over what lies on it. */
export function useLayers(
  deps: Readonly<{ canvas: CanvasBody; sheet: PaperSheet; looking: Looking; place: Place }>,
) {
  const { sheet, looking } = deps
  const [finder, setFinder] = useState<Opened | undefined>(undefined)
  const opener = useRef<Element | null>(null)
  const [dropped, setDropped] = useState<readonly Dropped[]>([])
  const [found, setFound] = useState<PaperBox | undefined>(undefined)
  const latest = useRef(deps)
  latest.current = deps
  useEffect(() => {
    if (found === undefined) return undefined
    const timer = setTimeout(() => setFound(undefined), FOUND_MS)
    return () => clearTimeout(timer)
  }, [found])
  const placeNear = useCallback(
    (near: Spot) => async (reference: CanvasReference) => {
      const placed = await latest.current.place(reference, near)
      if (placed.kind !== 'there') return placed
      const now = latest.current
      const box = boxOf(now.canvas, now.sheet, placed.item)
      now.looking.look({ ...middle(box), zoom: now.looking.view.zoom })
      setFound(box)
      return placed
    },
    [],
  )
  const centre = (): PaperPoint => ({
    x: Math.max(0, Math.min(sheet.width, Math.round(looking.view.x))),
    y: Math.max(0, Math.min(sheet.height, Math.round(looking.view.y) + BELOW_MIDDLE)),
  })
  return {
    finder,
    dropped,
    found,
    placeNear,
    open(at: PaperPoint | undefined, from: Element | null): void {
      opener.current = from
      setFinder({ at: at ?? centre() })
    },
    closeFinder: useCallback((refocus: boolean) => {
      const from = opener.current
      opener.current = null
      setFinder(undefined)
      if (refocus && from instanceof HTMLElement && from.isConnected) from.focus()
    }, []),
    drop(files: readonly File[], at: PaperPoint): void {
      setDropped(was => [...was, { id: crypto.randomUUID(), at, files }])
    },
    closeDrop(id: string): void {
      setDropped(was => was.filter(one => one.id !== id))
    },
  }
}

function writing(element: Element | null): boolean {
  return (
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      element.closest('input, textarea, select, [contenteditable="true"]') !== null)
  )
}

/** `@` opens the finder while the sheet is shown and nothing is written in: at the pointer on bare paper, else mid-view. */
export function FinderKey(
  props: Readonly<{
    root: RefObject<HTMLElement | null>
    pointer: RefObject<PaperPoint | undefined>
    closed: boolean
    open: (at: PaperPoint | undefined, opener: Element | null) => void
  }>,
): null {
  const paperAt = usePaperAt()
  const latest = useRef({ ...props, paperAt })
  latest.current = { ...props, paperAt }
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== '@' || event.defaultPrevented || event.isComposing) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const now = latest.current
      const element = now.root.current
      if (!now.closed || element === null || element.closest('[inert]') !== null) return
      if (writing(document.activeElement)) return
      event.preventDefault()
      const pointer = now.pointer.current
      now.open(pointer === undefined ? undefined : now.paperAt(pointer), document.activeElement)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])
  return null
}

export function FoundMark({ box }: Readonly<{ box: PaperBox }>): JSX.Element {
  return (
    <PaperSpot at={middle(box)} className="canvas-found-spot">
      <div className="canvas-found" style={{ width: box.width, height: box.height }} />
    </PaperSpot>
  )
}

/** Over bare paper the pointer says where `@` opens the finder; over anything else it says nothing. */
export function bareAt(event: React.PointerEvent): PaperPoint | undefined {
  const target = event.target
  if (!(target instanceof Element)) return undefined
  if (target.closest('.omne-paper-surface') === null) return undefined
  if (target.closest('[data-paper-item]') !== null) return undefined
  return { x: event.clientX, y: event.clientY }
}
