import type { CanvasBody, CanvasItemBody, CanvasPileBody } from '@omne-harness/canvas-protocol'
import {
  PAPER_NAME_LINE,
  type PaperBox,
  type PaperSheet,
  type SizeLimits,
  type ZoomLimits,
} from '@omne-harness/ui-kit'

type Size = Readonly<{ width: number; height: number }>

/** `canvas/v1` does not tell these: the local deployment's footprint and least and most sizes. */
export const FOOTPRINT: Size = { width: 160, height: 80 }
const LEAST: Size = { width: 120, height: 64 }
const MOST: Size = { width: 900, height: 900 }

export const ZOOM_LIMITS: ZoomLimits = { min: 0.25, max: 2 }

/** The limits of a page's box: the name line under its content is in the box, so it is added here once. */
export const PAGE_LIMITS: SizeLimits = {
  minWidth: LEAST.width,
  minHeight: LEAST.height + PAPER_NAME_LINE,
  maxWidth: MOST.width,
  maxHeight: MOST.height + PAPER_NAME_LINE,
}

export const paperSheet = (canvas: CanvasBody): PaperSheet => ({
  width: canvas.sheet.width,
  height: canvas.sheet.height,
  step: canvas.sheet.grid,
})

/** An item whose box is off the sheet is drawn inside it; what is on the server stays as it is. */
function onSheet(box: PaperBox, sheet: PaperSheet): PaperBox {
  return {
    ...box,
    x: Math.max(0, Math.min(box.x, sheet.width - box.width)),
    y: Math.max(0, Math.min(box.y, sheet.height - box.height)),
  }
}

/** The box a page is drawn in: the content the server sizes, and the name line under it. */
export function itemBox(item: CanvasItemBody, sheet: PaperSheet): PaperBox {
  const size = item.size ?? FOOTPRINT
  return onSheet(
    { x: item.at.x, y: item.at.y, width: size.width, height: size.height + PAPER_NAME_LINE },
    sheet,
  )
}

export function pileBox(pile: CanvasPileBody, sheet: PaperSheet): PaperBox {
  return onSheet(
    {
      x: pile.at.x,
      y: pile.at.y,
      width: FOOTPRINT.width,
      height: FOOTPRINT.height + PAPER_NAME_LINE,
    },
    sheet,
  )
}

export const contentSize = (box: PaperBox): Size => ({
  width: box.width,
  height: box.height - PAPER_NAME_LINE,
})

export const holds = (box: PaperBox, point: Readonly<{ x: number; y: number }>): boolean =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height
