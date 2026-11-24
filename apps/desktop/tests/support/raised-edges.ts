/**
 * FE-I37, a raised control is not cut: the judge of the look walk (demo/visual-walk.mjs) and of its cases
 * (tests/raised-edges.spec.ts). It takes the geometry the walk reads in the page and answers which controls are
 * raised and which of them a clipping ancestor cuts. Pure data in, pure data out: no DOM here.
 */

/** A box in the viewport, in CSS px. */
export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

/** One axis of a clipping ancestor whose overflow on that axis is not `visible`. */
export interface ClipAxis {
  readonly overflow: 'hidden' | 'clip' | 'auto' | 'scroll'
  /** `scrollLeft` or `scrollTop`. */
  readonly position: number
  /** `scrollWidth` or `scrollHeight`. */
  readonly size: number
  /** `clientWidth` or `clientHeight`. */
  readonly client: number
  /** The computed `overflow-clip-margin` in px: it widens the clip of `overflow: clip` only. */
  readonly clipMargin?: number
}

/** An ancestor that clips the control on at least one axis. */
export interface Clipper {
  /** Its class names, to find it in the stylesheets. */
  readonly name: string
  /** Its padding box without the scrollbars: what it shows of its content. */
  readonly box: Box
  /** Absent where the overflow on that axis is `visible`. */
  readonly x?: ClipAxis
  readonly y?: ClipAxis
}

/** A shown candidate (an element with `data-control`, a segmented track or its thumb), as the page computed it. */
export interface Control {
  /** The `data-control` value, or `segmented` and `segmented-thumb`. */
  readonly control: string
  /** Its accessible name or text, and a class to find it by. */
  readonly label: string
  /** Its border box. */
  readonly box: Box
  /** The computed border of each side, `<width> <style> <color>`. */
  readonly borders: readonly string[]
  /** The computed `box-shadow`. */
  readonly boxShadow: string
  /** The ring room in px: the focus ring's width plus its offset. */
  readonly ringRoom: number
  /** Every ancestor that clips it, the nearest first. */
  readonly clippers: readonly Clipper[]
}

export interface Raised {
  readonly control: string
  readonly label: string
  readonly box: Box
}

export interface ClipViolation {
  readonly control: string
  readonly label: string
  readonly clipper: string
  readonly side: Side
  /** How many px of the control and its room the clipper cuts. */
  readonly short: number
}

export interface RaisedEdges {
  readonly raised: readonly Raised[]
  readonly violations: readonly ClipViolation[]
}

/** Layout rounds to fractions of a px; less than this is not a cut. */
const EPSILON = 0.1
/** Scroll positions are whole px: this close to the start or the end is there. */
const SCROLL_SLACK = 1

type Interval = readonly [number, number]
type Sides = Readonly<Record<Side, number>>

const AXES = [
  { axis: 'x', start: 'left', end: 'right' },
  { axis: 'y', start: 'top', end: 'bottom' },
] as const

/** The alpha of a computed color: `transparent`, `rgba(…, a)` or `…(… / a)`; any other color is opaque. */
function alphaOf(color: string): number {
  if (/\btransparent\b/.test(color)) return 0
  const call = /[a-z-]+\(([^)]*)\)/i.exec(color)
  if (call === null) return 1
  const args = call[1]!
  const slash = args.split('/')
  const commas = args.split(',')
  const alpha = slash.length > 1 ? slash[1]! : commas.length === 4 ? commas[3]! : undefined
  if (alpha === undefined) return 1
  const value = Number.parseFloat(alpha)
  return alpha.trim().endsWith('%') ? value / 100 : value
}

/** The comma-separated layers of a computed `box-shadow`, not split inside a color function. */
function layers(boxShadow: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let at = 0; at < boxShadow.length; at += 1) {
    const char = boxShadow[at]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      out.push(boxShadow.slice(from, at))
      from = at + 1
    }
  }
  out.push(boxShadow.slice(from))
  return out.map(layer => layer.trim()).filter(layer => layer !== '' && layer !== 'none')
}

interface Shadow {
  readonly inset: boolean
  readonly x: number
  readonly y: number
  readonly blur: number
  readonly spread: number
}

/** The layers of a computed `box-shadow` whose color shows. */
function shadowsOf(boxShadow: string): Shadow[] {
  return layers(boxShadow)
    .filter(layer => alphaOf(layer) > 0)
    .map(layer => {
      const [x = 0, y = 0, blur = 0, spread = 0] = layer
        .replace(/[a-z-]+\([^)]*\)/gi, ' ')
        .trim()
        .split(/\s+/)
        .filter(token => /^-?\d*\.?\d+(?:px)?$/.test(token))
        .map(Number.parseFloat)
      return { inset: /\binset\b/.test(layer), x, y, blur, spread }
    })
}

/** How far the outer shadows reach past the border box on each side: offset, blur and spread. */
function shadowReach(shadows: readonly Shadow[]): Sides {
  const reach = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const { inset, x, y, blur, spread } of shadows) {
    if (inset) continue
    reach.top = Math.max(reach.top, spread + blur - y)
    reach.right = Math.max(reach.right, spread + blur + x)
    reach.bottom = Math.max(reach.bottom, spread + blur + y)
    reach.left = Math.max(reach.left, spread + blur - x)
  }
  return reach
}

/**
 * An inset shadow with no offset and no blur draws a line along the inside of the border box, as a border does: the
 * edge of a segmented control's track and of its raised segment (ui-kit `.omne-segmented`). It reaches nowhere out.
 */
const insetLine = (shadows: readonly Shadow[]): boolean =>
  shadows.some(
    ({ inset, x, y, blur, spread }) => inset && x === 0 && y === 0 && blur === 0 && spread > 0,
  )

/** A border side that draws: a width, a style that is not `none` or `hidden`, and a color that shows. */
function drawsBorder(border: string): boolean {
  const [width = '0', style = 'none', ...color] = border.trim().split(/\s+/)
  return (
    Number.parseFloat(width) > 0 &&
    style !== 'none' &&
    style !== 'hidden' &&
    alphaOf(color.join(' ')) > 0
  )
}

const interval = (box: Box, axis: 'x' | 'y'): Interval =>
  axis === 'x' ? [box.x, box.x + box.width] : [box.y, box.y + box.height]

const round = (px: number): number => Math.round(px * 100) / 100

/** What the clipper shows on one axis: its padding box, widened by the clip margin of `overflow: clip`. */
function shownOn(clipper: Clipper, axis: 'x' | 'y', clip: ClipAxis): Interval {
  const [start, end] = interval(clipper.box, axis)
  const margin = clip.overflow === 'clip' ? (clip.clipMargin ?? 0) : 0
  return [start - margin, end + margin]
}

/**
 * Which controls are raised (a border, an inset line or an outer shadow that draws), and where a clipping ancestor
 * cuts one of them together with its room: on each side the farther of its shadow's reach and the ring room. Per
 * ancestor, nearest first, and per axis it clips:
 *
 * - an axis that does not scroll: the control and its room lie wholly in what the ancestor shows;
 * - an axis that scrolls: crossing the start edge is a cut only when scrolled to the start, crossing the end edge
 *   only when scrolled to the end; anything else is scrolled out of view;
 * - a control wholly outside what the ancestor shows is not cut, there or farther out.
 *
 * Each ancestor judges only what the nearer ones let through, so one cut is told once, by the ancestor that makes it.
 */
export function raisedEdges(controls: readonly Control[]): RaisedEdges {
  const raised: Raised[] = []
  const violations: ClipViolation[] = []
  for (const control of controls) {
    const shadows = shadowsOf(control.boxShadow)
    const reach = shadowReach(shadows)
    const shadowed = Object.values(reach).some(px => px > 0)
    if (!shadowed && !insetLine(shadows) && !control.borders.some(drawsBorder)) continue
    raised.push({ control: control.control, label: control.label, box: control.box })
    const room = (side: Side): number => Math.max(control.ringRoom, reach[side])
    const body = { x: interval(control.box, 'x'), y: interval(control.box, 'y') }
    const outer = {
      x: [body.x[0] - room('left'), body.x[1] + room('right')] as Interval,
      y: [body.y[0] - room('top'), body.y[1] + room('bottom')] as Interval,
    }
    for (const clipper of control.clippers) {
      const hidden = AXES.some(({ axis }) => {
        const clip = clipper[axis]
        if (clip === undefined) return false
        const [start, end] = shownOn(clipper, axis, clip)
        return body[axis][1] <= start + EPSILON || body[axis][0] >= end - EPSILON
      })
      if (hidden) break
      for (const { axis, start: startSide, end: endSide } of AXES) {
        const clip = clipper[axis]
        if (clip === undefined) continue
        const [start, end] = shownOn(clipper, axis, clip)
        const scrolls =
          (clip.overflow === 'auto' || clip.overflow === 'scroll') &&
          clip.size - clip.client > SCROLL_SLACK
        const atStart = !scrolls || clip.position <= SCROLL_SLACK
        const atEnd = !scrolls || clip.position + clip.client >= clip.size - SCROLL_SLACK
        const cut = (side: Side, short: number): void => {
          if (short > EPSILON)
            violations.push({
              control: control.control,
              label: control.label,
              clipper: clipper.name,
              side,
              short: round(short),
            })
        }
        if (atStart) cut(startSide, start - outer[axis][0])
        if (atEnd) cut(endSide, outer[axis][1] - end)
        body[axis] = [Math.max(body[axis][0], start), Math.min(body[axis][1], end)]
        outer[axis] = [Math.max(outer[axis][0], start), Math.min(outer[axis][1], end)]
      }
    }
  }
  return { raised, violations }
}
