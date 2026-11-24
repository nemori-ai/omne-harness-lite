import type { CanvasBody, CanvasItemBody, CanvasPileBody } from '@omne-harness/canvas-protocol'
import {
  PAPER_NAME_LINE,
  type PaperBox,
  type PaperSheet,
  type SizeLimits,
  type ZoomLimits,
} from '@omne-harness/ui-kit'

type Size = Readonly<{ width: number; height: number }>

/** The sheet as the module draws it: the paper's, with the footprint the server gives an item of no size. */
export type Sheet = PaperSheet & Readonly<{ footprint: Size }>

export const ZOOM_LIMITS: ZoomLimits = { min: 0.25, max: 2 }

/** The limits of a page's box, read from the sheet: the name line under its content is in the box, so it is added here once. */
export const pageLimits = (canvas: CanvasBody): SizeLimits => ({
  minWidth: canvas.sheet.size.min.width,
  minHeight: canvas.sheet.size.min.height + PAPER_NAME_LINE,
  maxWidth: canvas.sheet.size.max.width,
  maxHeight: canvas.sheet.size.max.height + PAPER_NAME_LINE,
})

export const paperSheet = (canvas: CanvasBody): Sheet => ({
  width: canvas.sheet.width,
  height: canvas.sheet.height,
  step: canvas.sheet.grid,
  footprint: canvas.sheet.footprint,
})

/** An item whose box is off the sheet is drawn inside it; what is on the server stays as it is. */
function onSheet(box: PaperBox, sheet: Sheet): PaperBox {
  return {
    ...box,
    x: Math.max(0, Math.min(box.x, sheet.width - box.width)),
    y: Math.max(0, Math.min(box.y, sheet.height - box.height)),
  }
}

/** The box a page is drawn in: the content the server sizes, and the name line under it. */
export function itemBox(item: CanvasItemBody, sheet: Sheet): PaperBox {
  const size = item.size ?? sheet.footprint
  return onSheet(
    { x: item.at.x, y: item.at.y, width: size.width, height: size.height + PAPER_NAME_LINE },
    sheet,
  )
}

export function pileBox(pile: CanvasPileBody, sheet: Sheet): PaperBox {
  return onSheet(
    {
      x: pile.at.x,
      y: pile.at.y,
      width: sheet.footprint.width,
      height: sheet.footprint.height + PAPER_NAME_LINE,
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
