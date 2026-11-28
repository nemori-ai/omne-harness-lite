import { BANDS, lay, Painter, FIGURE_PAPER, type Brushed } from './bristle.ts'
import { inkNow } from './clock.ts'
import { CANVAS, CENTRE } from './ink.ts'
import { type InkStroke } from './writing.ts'

export const REACH = 128 / 56

export interface Area {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const OWN_PAPER: Area = (() => {
  const margin = (CANVAS * (REACH - 1)) / 2
  return { x: -margin, y: -margin, width: CANVAS + margin * 2, height: CANVAS + margin * 2 }
})()

export interface InkMark {
  readonly key: number
  readonly stroke: InkStroke
  readonly written: number
  readonly opacity: number
  readonly tone: 'ink' | 'amber'
  readonly tail?: {
    readonly from: number
    readonly to: number
    readonly alpha: number
    readonly gone: readonly [number, number]
  }
}

export interface InkFrame {
  readonly marks: readonly InkMark[]
  readonly wash: number
}

interface Layer {
  readonly canvases: readonly (HTMLCanvasElement | OffscreenCanvas)[]
  readonly ctxs: readonly CanvasRenderingContext2D[]
  readonly painter: Painter
  readonly x: number
  readonly y: number
}

const laid = new WeakMap<InkStroke, Map<number, Brushed>>()
export const brushedOf = (stroke: InkStroke, brush = 1): Brushed => {
  let byBrush = laid.get(stroke)
  if (byBrush === undefined) {
    byBrush = new Map()
    laid.set(stroke, byBrush)
  }
  let brushed = byBrush.get(brush)
  if (brushed === undefined) {
    brushed = lay(brush === 1 ? stroke : { ...stroke, weight: stroke.weight * brush }, FIGURE_PAPER)
    byBrush.set(brush, brushed)
  }
  return brushed
}

const surface = (width: number, height: number): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export const INK_TIMING = {
  frames: 0,
  total: 0,
  worst: 0,
  reset(): void {
    this.frames = 0
    this.total = 0
    this.worst = 0
  },
}

const looks = new Set<() => void>()

export function watchInkLook(changed: () => void): () => void {
  looks.add(changed)
  return () => looks.delete(changed)
}

export function inkLookChanged(): void {
  for (const changed of looks) changed()
}

export class InkCanvas {
  private readonly canvas: HTMLCanvasElement
  private readonly size: number
  private readonly area: Area
  private readonly brush: number
  private readonly layers = new Map<number, Layer>()
  private readonly ctx: CanvasRenderingContext2D | null
  private scratch: {
    canvas: HTMLCanvasElement | OffscreenCanvas
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  } | null = null
  private ratio = 0
  private scale = 1
  private colours: { ink: string; amber: string; wash: readonly [string, string, string] } | null =
    null
  private last: InkFrame | null = null
  private readonly unwatch: () => void

  public constructor(canvas: HTMLCanvasElement, size: number, area: Area = OWN_PAPER, brush = 1) {
    this.canvas = canvas
    this.size = size
    this.area = area
    this.brush = brush
    this.ctx = canvas.getContext('2d')
    const stale = (): void => {
      this.colours = null
      if (this.last !== null) this.show(this.last)
    }
    const scheme =
      typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(stale) : null
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    })
    scheme?.addEventListener('change', stale)
    const unlook = watchInkLook(stale)
    this.unwatch = () => {
      observer?.disconnect()
      scheme?.removeEventListener('change', stale)
      unlook()
    }
  }

  public dispose(): void {
    this.unwatch()
    this.layers.clear()
    this.scratch = null
  }

  public draw(frame: InkFrame): void {
    const ctx = this.ctx
    if (ctx === null) return
    const begun = inkNow()
    this.fit()
    for (const mark of frame.marks) {
      const layer = this.layer(mark)
      if (layer !== null) {
        layer.painter.paint(layer.ctxs, mark.written)
        if (mark.tail !== undefined) {
          layer.painter.erase(layer.ctxs, mark.tail.gone[0], mark.tail.gone[1], 1)
          layer.painter.erase(layer.ctxs, mark.tail.from, mark.tail.to, mark.tail.alpha)
        }
      }
    }
    for (const key of Array.from(this.layers.keys()))
      if (!frame.marks.some(mark => mark.key === key)) this.layers.delete(key)
    this.show(frame)
    const took = inkNow() - begun
    INK_TIMING.frames += 1
    INK_TIMING.total += took
    INK_TIMING.worst = Math.max(INK_TIMING.worst, took)
  }

  private fit(): void {
    const ratio = Math.max(1, Math.min(4, globalThis.devicePixelRatio || 1))
    if (ratio === this.ratio) return
    this.ratio = ratio
    const width = Math.max(1, Math.round((this.area.width * this.size * ratio) / CANVAS))
    this.canvas.width = width
    this.canvas.height = Math.max(1, Math.round((this.area.height * this.size * ratio) / CANVAS))
    this.scale = width / this.area.width
    this.layers.clear()
    this.scratch = null
  }

  private layer(mark: InkMark): Layer | null {
    const known = this.layers.get(mark.key)
    if (known !== undefined) return known
    const brushed = brushedOf(mark.stroke, this.brush)
    const { scale, area } = this
    const x0 = Math.max(0, Math.floor((brushed.bounds.x - area.x) * scale))
    const y0 = Math.max(0, Math.floor((brushed.bounds.y - area.y) * scale))
    const x1 = Math.min(
      this.canvas.width,
      Math.ceil((brushed.bounds.x + brushed.bounds.width - area.x) * scale),
    )
    const y1 = Math.min(
      this.canvas.height,
      Math.ceil((brushed.bounds.y + brushed.bounds.height - area.y) * scale),
    )
    if (x1 <= x0 || y1 <= y0) return null
    const canvases = BANDS.map(() => surface(x1 - x0, y1 - y0))
    const ctxs: CanvasRenderingContext2D[] = []
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
      if (ctx === null) return null
      ctx.setTransform(scale, 0, 0, scale, -area.x * scale - x0, -area.y * scale - y0)
      ctx.fillStyle = 'CanvasText'
      ctxs.push(ctx)
    }
    const layer: Layer = { canvases, ctxs, painter: new Painter(brushed), x: x0, y: y0 }
    this.layers.set(mark.key, layer)
    return layer
  }

  private colour(): { ink: string; amber: string; wash: readonly [string, string, string] } {
    if (this.colours !== null) return this.colours
    const style = getComputedStyle(this.canvas)
    const amber = style.color
    const ink =
      this.canvas.parentElement === null ? amber : getComputedStyle(this.canvas.parentElement).color
    const wash = [
      style.getPropertyValue('--omne-ink-wash-core').trim() || 'transparent',
      style.getPropertyValue('--omne-ink-wash-rim').trim() || 'transparent',
      style.getPropertyValue('--omne-ink-wash-out').trim() || 'transparent',
    ] as const
    this.colours = { ink: ink || 'CanvasText', amber: amber || ink, wash }
    return this.colours
  }

  private show(frame: InkFrame): void {
    this.last = frame
    const ctx = this.ctx
    if (ctx === null) return
    const { width, height } = this.canvas
    const { ink, amber, wash } = this.colour()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, width, height)
    if (frame.wash > 0.002) {
      const cx = (CENTRE[0] - this.area.x) * this.scale
      const cy = (CENTRE[1] - this.area.y) * this.scale
      const r = 16.5 * this.scale
      ctx.globalAlpha = frame.wash
      const fade = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      fade.addColorStop(0, wash[0])
      fade.addColorStop(0.72, wash[1])
      fade.addColorStop(1, wash[2])
      this.tone(frame, null, ink, scratch => {
        scratch.fillStyle = fade
        scratch.fillRect(cx - r, cy - r, r * 2, r * 2)
      })
      ctx.globalAlpha = 1
    }
    this.tone(frame, 'ink', ink)
    this.tone(frame, 'amber', amber)
  }

  private tone(
    frame: InkFrame,
    tone: 'ink' | 'amber' | null,
    colour: string,
    paint?: (scratch: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => void,
  ): void {
    const ctx = this.ctx!
    const marks =
      tone === null ? [] : frame.marks.filter(mark => mark.tone === tone && mark.opacity > 0.002)
    if (tone !== null && marks.length === 0) return
    const { width, height } = this.canvas
    if (this.scratch === null) {
      const canvas = surface(width, height)
      const scratchCtx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null
      if (scratchCtx === null) return
      this.scratch = { canvas, ctx: scratchCtx }
    }
    const scratch = this.scratch.ctx
    scratch.globalCompositeOperation = 'source-over'
    scratch.globalAlpha = 1
    scratch.clearRect(0, 0, width, height)
    if (paint !== undefined) paint(scratch)
    for (const mark of marks) {
      const layer = this.layers.get(mark.key)
      if (layer === undefined) continue
      layer.canvases.forEach((canvas, band) => {
        scratch.globalAlpha = Math.min(1, mark.opacity * mark.stroke.ink * BANDS[band]!)
        scratch.drawImage(canvas, layer.x, layer.y)
      })
    }
    scratch.globalAlpha = 1
    scratch.globalCompositeOperation = 'source-in'
    scratch.fillStyle = colour
    scratch.fillRect(0, 0, width, height)
    scratch.globalCompositeOperation = 'source-over'
    ctx.drawImage(this.scratch.canvas, 0, 0)
  }
}
