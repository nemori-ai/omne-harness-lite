export type PaperPoint = Readonly<{ x: number; y: number }>

export const PAPER_NAME_LINE = 22

export type PaperBox = Readonly<{ x: number; y: number; width: number; height: number }>

export type PaperSheet = Readonly<{ width: number; height: number; step: number }>

export type PaperView = Readonly<{ x: number; y: number; zoom: number }>

export type ZoomLimits = Readonly<{ min: number; max: number }>

export type SizeLimits = Readonly<{
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}>

export type Magnet = Readonly<{ on: boolean; step: number }>

export type Lens = Readonly<{ width: number; height: number; sizeFactor: number }>

export type PaperCorner = 'nw' | 'ne' | 'sw' | 'se'

export function snap(value: number, magnet: Magnet): number {
  if (!magnet.on || !(magnet.step > 0)) return value
  return Math.round(value / magnet.step) * magnet.step
}

export function snapBox(box: PaperBox, magnet: Magnet): PaperBox {
  if (!magnet.on || !(magnet.step > 0)) return box
  return {
    x: snap(box.x, magnet),
    y: snap(box.y, magnet),
    width: snap(box.width, magnet),
    height: snap(box.height, magnet),
  }
}

function settle(value: number, magnet: Magnet): number {
  return magnet.on && magnet.step > 0 ? snap(value, magnet) : Math.round(value)
}

function unitOf(magnet: Magnet): number {
  return magnet.on && magnet.step > 0 ? magnet.step : 1
}

function within(value: number, low: number, high: number, unit: number): number {
  const gridLow = Math.ceil(low / unit) * unit
  const gridHigh = Math.floor(high / unit) * unit
  const [from, to] = gridLow <= gridHigh ? [gridLow, gridHigh] : [low, high]
  return Math.min(Math.max(value, from), Math.max(from, to))
}

export function clampMove(box: PaperBox, sheet: PaperSheet, magnet: Magnet): PaperBox {
  const unit = unitOf(magnet)
  return {
    ...box,
    x: within(settle(box.x, magnet), 0, sheet.width - box.width, unit),
    y: within(settle(box.y, magnet), 0, sheet.height - box.height, unit),
  }
}

export function landPoint(point: PaperPoint, sheet: PaperSheet, magnet: Magnet): PaperPoint {
  const unit = unitOf(magnet)
  return {
    x: within(settle(point.x, magnet), 0, sheet.width, unit),
    y: within(settle(point.y, magnet), 0, sheet.height, unit),
  }
}

export function moveBox(
  box: PaperBox,
  by: PaperPoint,
  sheet: PaperSheet,
  magnet: Magnet,
): PaperBox {
  return clampMove({ ...box, x: box.x + by.x, y: box.y + by.y }, sheet, magnet)
}

type Span = Readonly<{ at: number; length: number }>

function resizeSpan(
  span: Span,
  movesStart: boolean,
  by: number,
  room: number,
  least: number,
  most: number,
  magnet: Magnet,
): Span {
  const unit = unitOf(magnet)
  if (movesStart) {
    const end = settle(span.at + span.length, magnet)
    const start = settle(span.at + by, magnet)
    const length = within(end - start, least, Math.min(most, end, room), unit)
    return { at: within(end - length, 0, room - length, unit), length }
  }
  const start = settle(span.at, magnet)
  const end = settle(span.at + span.length + by, magnet)
  const length = within(end - start, least, Math.min(most, room - Math.max(start, 0)), unit)
  return { at: within(start, 0, room - length, unit), length }
}

export function resizeBox(
  box: PaperBox,
  corner: PaperCorner,
  by: PaperPoint,
  sheet: PaperSheet,
  limits: SizeLimits,
  magnet: Magnet,
): PaperBox {
  const across = resizeSpan(
    { at: box.x, length: box.width },
    corner === 'nw' || corner === 'sw',
    by.x,
    sheet.width,
    limits.minWidth,
    limits.maxWidth,
    magnet,
  )
  const down = resizeSpan(
    { at: box.y, length: box.height - PAPER_NAME_LINE },
    corner === 'nw' || corner === 'ne',
    by.y,
    sheet.height - PAPER_NAME_LINE,
    limits.minHeight - PAPER_NAME_LINE,
    limits.maxHeight - PAPER_NAME_LINE,
    magnet,
  )
  return { x: across.at, y: down.at, width: across.length, height: down.length + PAPER_NAME_LINE }
}

export function clampZoom(zoom: number, limits: ZoomLimits): number {
  const least = Math.min(limits.min, limits.max)
  const most = Math.max(limits.min, limits.max)
  if (!Number.isFinite(zoom)) return Math.min(Math.max(1, least), most)
  return Math.min(Math.max(zoom, least), most)
}

function scaleOf(zoom: number, lens: Lens): number {
  return zoom * (lens.sizeFactor > 0 ? lens.sizeFactor : 1)
}

function centreRange(length: number, seen: number): readonly [number, number] {
  const half = seen / 2
  return [Math.min(half, length - half), Math.max(half, length - half)]
}

export function clampView(
  view: PaperView,
  sheet: PaperSheet,
  lens: Lens,
  limits: ZoomLimits,
): PaperView {
  const zoom = clampZoom(view.zoom, limits)
  const scale = scaleOf(zoom, lens)
  const [left, right] = centreRange(sheet.width, lens.width / scale)
  const [top, bottom] = centreRange(sheet.height, lens.height / scale)
  const x = Number.isFinite(view.x) ? view.x : sheet.width / 2
  const y = Number.isFinite(view.y) ? view.y : sheet.height / 2
  return {
    x: Math.min(Math.max(x, left), right),
    y: Math.min(Math.max(y, top), bottom),
    zoom,
  }
}

export function screenToPaper(point: PaperPoint, view: PaperView, lens: Lens): PaperPoint {
  const scale = scaleOf(view.zoom, lens)
  return {
    x: view.x + (point.x - lens.width / 2) / scale,
    y: view.y + (point.y - lens.height / 2) / scale,
  }
}

export function paperToScreen(point: PaperPoint, view: PaperView, lens: Lens): PaperPoint {
  const scale = scaleOf(view.zoom, lens)
  return {
    x: (point.x - view.x) * scale + lens.width / 2,
    y: (point.y - view.y) * scale + lens.height / 2,
  }
}

export function screenToPaperDistance(by: PaperPoint, zoom: number, lens: Lens): PaperPoint {
  const scale = scaleOf(zoom, lens)
  return { x: by.x / scale, y: by.y / scale }
}

export function panBy(
  view: PaperView,
  by: PaperPoint,
  sheet: PaperSheet,
  lens: Lens,
  limits: ZoomLimits,
): PaperView {
  const distance = screenToPaperDistance(by, view.zoom, lens)
  return clampView(
    { x: view.x - distance.x, y: view.y - distance.y, zoom: view.zoom },
    sheet,
    lens,
    limits,
  )
}

export function zoomAround(
  view: PaperView,
  at: PaperPoint,
  zoom: number,
  sheet: PaperSheet,
  lens: Lens,
  limits: ZoomLimits,
): PaperView {
  const under = screenToPaper(at, view, lens)
  const next = clampZoom(zoom, limits)
  const scale = scaleOf(next, lens)
  return clampView(
    {
      x: under.x - (at.x - lens.width / 2) / scale,
      y: under.y - (at.y - lens.height / 2) / scale,
      zoom: next,
    },
    sheet,
    lens,
    limits,
  )
}
