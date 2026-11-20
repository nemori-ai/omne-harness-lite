import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { type Point } from '../icons/brush.ts'
import { useSizeFactor } from '../size/use-size-factor.ts'
import { brushTime, ms, WRITE } from './body.ts'
import { inkNow } from './clock.ts'
import { InkCanvas, type InkMark } from './ink-canvas.ts'
import {
  bubbleArea,
  bubbleLines,
  bubbleStrokes,
  unitOf,
  type BubbleInk as Strength,
  type BubbleShape,
  type BubbleStroke,
  type Rect,
} from './note-ink.ts'
import { FIGURE_SIZE } from './store.ts'
import { freshSeed } from './writing.ts'

type Phase = 'writing' | 'open' | 'folding' | 'gone'

interface Live {
  written: number
  opacity: number
  start: number
  duration: number
  dry: number
  from: number
  foldStart: number
  foldDuration: number
}

const AT_REST = 0.5
const clamp = (value: number): number => Math.min(1, Math.max(0, value))
const washed = (share: number): number => 1 - (1 - clamp(share)) ** 1.6
const PAPER_GOES = 1.6

class BubbleInk {
  private phase: Phase
  private foldBegun = 0
  private live: Live[] = []
  private strokes: readonly BubbleStroke[] = []
  private area: Rect | null = null
  private size = FIGURE_SIZE
  private canvas: InkCanvas | null = null
  private wet: HTMLDivElement | null = null
  private readonly rests: (SVGPathElement | null)[] = []
  private frame = 0
  private begun: number | null = null
  private washEnd = 1
  private fold = { paper: 1, left: 1 }
  private onGone: (() => void) | null = null

  constructor(reduced: boolean) {
    this.phase = reduced ? 'open' : 'writing'
  }

  private get host(): HTMLElement | null {
    return this.wet?.parentElement ?? null
  }

  public mount(wet: HTMLDivElement | null): void {
    this.wet = wet
    const element = this.host
    if (element === null) return
    const writing = this.phase === 'writing'
    element.dataset['ink'] = writing ? 'writing' : 'open'
    element.style.setProperty('--omne-ink-bubble-paper', writing ? '0' : '1')
  }

  public restPath(index: number, path: SVGPathElement | null): void {
    this.rests[index] = path
  }

  public listen(onGone: (() => void) | null): void {
    this.onGone = onGone
  }

  public shape(
    strokes: readonly BubbleStroke[],
    area: Rect | null,
    root: Point | null,
    size = FIGURE_SIZE,
  ): void {
    this.size = size
    this.strokes = strokes
    this.area = area
    if (root !== null)
      this.host?.style.setProperty(
        '--omne-ink-bubble-paper-at',
        `${root[0].toFixed(1)}px ${root[1].toFixed(1)}px`,
      )
    if (strokes.length === 0) return
    if (this.phase !== 'writing' || this.begun !== null) {
      if (this.phase === 'open') {
        if (this.canvas !== null) {
          this.dropPaper()
          cancelAnimationFrame(this.frame)
          this.frame = 0
        }
        strokes.forEach((_, i) => this.setRest(i, 1))
        for (const mark of this.live) mark.dry = -Infinity
      }
      if (this.phase === 'writing' && this.begun !== null) {
        this.dropPaper()
        this.wake()
      }
      return
    }
    this.begun = inkNow()
    const first = ms(WRITE.noteFirst)
    const second = { start: ms(WRITE.noteSecondAt), duration: ms(WRITE.noteSecond) }
    const close = second.start + second.duration
    this.washEnd = close
    let outlines = 0
    this.live = strokes.map(stroke => {
      let start = 0
      let duration = first
      if (stroke.part === 'outline') {
        if (outlines++ === 1) ({ start, duration } = second)
      }
      return {
        written: 0,
        opacity: 1,
        start,
        duration,
        dry: (stroke.part === 'outline' ? close : start + duration) + ms(80),
        from: 0,
        foldStart: 0,
        foldDuration: 0,
      }
    })
    strokes.forEach((_, i) => this.setRest(i, 0))
    this.wake()
  }

  public finish = (): void => {
    if (this.phase !== 'writing' || this.begun === null) return
    const clock = inkNow() - this.begun
    for (const mark of this.live) {
      if (mark.start + mark.duration > clock) {
        mark.start = clock - mark.duration
        mark.dry = clock + ms(80)
      }
    }
    this.washEnd = Math.min(this.washEnd, clock)
    this.wake()
  }

  public close(reduced: boolean): void {
    const element = this.host
    const list = this.strokes
    if (reduced || element === null || list.length === 0) {
      this.gone()
      return
    }
    if (this.phase === 'folding' || this.phase === 'gone') return
    if (this.begun === null) this.begun = inkNow()
    this.foldBegun = inkNow() - this.begun
    const clock = this.foldBegun
    if (this.live.length !== list.length)
      this.live = list.map(() => ({
        written: 1,
        opacity: AT_REST,
        start: 0,
        duration: 0,
        dry: Infinity,
        from: 1,
        foldStart: 0,
        foldDuration: 0,
      }))
    const fromRest = this.canvas === null
    this.phase = 'folding'
    element.dataset['ink'] = 'folding'
    list.forEach((_, i) => this.setRest(i, 0))
    for (const mark of this.live) {
      mark.from = fromRest ? 1 : mark.written
      mark.opacity = fromRest ? AT_REST : Math.max(mark.opacity, mark.written > 0 ? AT_REST : 0)
    }
    let outlines = 0
    const roles = list.map(stroke =>
      stroke.part === 'outline' ? (outlines++ === 0 ? 'first' : 'second') : stroke.part,
    )
    const most = (role: string): number =>
      Math.max(0, ...this.live.filter((_, i) => roles[i] === role).map(mark => mark.from))
    const timeOf = (role: string, full: number): number =>
      most(role) > 0 ? ms(full) * (0.45 + 0.55 * most(role)) : 0
    const time = {
      second: timeOf('second', WRITE.noteFoldSecond),
      first: timeOf('first', WRITE.noteFoldFirst),
    }
    const at = { second: 0, first: time.second }
    this.live.forEach((mark, i) => {
      const role = roles[i] as keyof typeof time
      mark.foldStart = clock + at[role]
      mark.foldDuration = Math.max(1, time[role])
    })
    const lengths = list.map(stroke => (stroke.part === 'outline' ? stroke.ink.line.length : 0))
    this.fold = {
      paper: Number.parseFloat(element.style.getPropertyValue('--omne-ink-bubble-paper') || '1'),
      left: Math.max(
        1e-3,
        this.live.reduce((sum, mark, i) => sum + mark.from * lengths[i]!, 0) /
          Math.max(
            1,
            lengths.reduce((a, b) => a + b, 0),
          ),
      ),
    }
    this.draw(
      list.map((stroke, i) => ({
        key: i + 1,
        stroke: stroke.ink,
        written: this.live[i]!.from,
        opacity: this.live[i]!.opacity,
        tone: 'ink',
      })),
    )
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.wake()
  }

  public dispose(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.canvas?.dispose()
    this.canvas = null
  }

  private gone(): void {
    this.phase = 'gone'
    this.onGone?.()
  }

  private setRest(index: number, opacity: number): void {
    const path = this.rests[index]
    if (path) path.style.opacity = opacity.toFixed(3)
  }

  private paper(): InkCanvas | null {
    if (this.canvas !== null) return this.canvas
    if (this.wet === null || this.area === null) return null
    const element = document.createElement('canvas')
    element.className = 'omne-figure-paper'
    Object.assign(element.style, { left: '0', top: '0', width: '100%', height: '100%' })
    this.wet.append(element)
    this.canvas = new InkCanvas(element, this.size, this.area)
    return this.canvas
  }

  private dropPaper(): void {
    this.canvas?.dispose()
    this.canvas = null
    this.wet?.replaceChildren()
  }

  private draw(marks: InkMark[]): void {
    this.paper()?.draw({ marks, wash: 0 })
  }

  private wake(): void {
    if (this.frame === 0) this.frame = requestAnimationFrame(this.tick)
  }

  private tick = (): void => {
    const now = inkNow()
    this.frame = 0
    const element = this.host
    const list = this.strokes
    if (element === null || list.length === 0) return
    const clock = now - (this.begun ?? now)
    const state = this.live
    const outline = list
      .map((stroke, i) => (stroke.part === 'outline' ? i : -1))
      .filter(i => i >= 0)
    const lengths = outline.map(i => list[i]!.ink.line.length)
    const total = lengths.reduce((a, b) => a + b, 0) || 1
    const written = (): number =>
      outline.reduce((sum, i, k) => sum + state[i]!.written * lengths[k]!, 0) / total
    let moving = false
    if (this.phase === 'writing' || this.phase === 'open') {
      let wet = false
      state.forEach((mark, i) => {
        mark.written = brushTime(clamp((clock - mark.start) / Math.max(1, mark.duration)))
        const drying = clamp((clock - mark.dry) / ms(WRITE.noteDry))
        mark.opacity = 1 - drying
        this.setRest(i, drying)
        if (mark.opacity > 0) wet = true
      })
      moving = wet
      element.style.setProperty(
        '--omne-ink-bubble-paper',
        (this.phase === 'open' ? 1 : washed(clock / Math.max(1, this.washEnd))).toFixed(3),
      )
      if (this.phase === 'writing' && outline.every(i => state[i]!.written >= 1)) {
        this.phase = 'open'
        element.dataset['ink'] = 'open'
      }
      if (wet)
        this.draw(
          state.map((mark, i) => ({
            key: i + 1,
            stroke: list[i]!.ink,
            written: mark.written,
            opacity: mark.opacity,
            tone: 'ink',
          })),
        )
      else this.dropPaper()
    } else if (this.phase === 'folding') {
      const marks: InkMark[] = state.map((mark, i) => {
        const head =
          mark.from * (1 - brushTime(clamp((clock - mark.foldStart) / mark.foldDuration)))
        if (head > 0.0005) moving = true
        mark.written = head
        return {
          key: i + 1,
          stroke: list[i]!.ink,
          written: mark.from,
          opacity: mark.opacity,
          tone: 'ink',
          tail: { from: Math.max(0, head - 0.05), to: head, alpha: 0.3, gone: [head, 1] },
        }
      })
      element.style.setProperty(
        '--omne-ink-bubble-paper',
        (this.fold.paper * Math.min(1, written() / this.fold.left) ** PAPER_GOES).toFixed(3),
      )
      if (!moving) {
        this.dropPaper()
        this.gone()
        return
      }
      this.draw(marks)
    }
    if (moving) this.wake()
  }
}

export function NoteInk({
  anchor,
  origin,
  closing,
  reduced,
  onGone,
  ink: strength = 'full',
}: {
  readonly anchor: Point
  readonly origin: Point
  readonly ink?: Strength
  readonly closing: boolean
  readonly reduced: boolean
  readonly onGone: (() => void) | null
}): React.JSX.Element {
  const app = useSizeFactor()
  const own = FIGURE_SIZE * app
  const unit = unitOf(own)
  const [seed] = useState(freshSeed)
  const [ink] = useState(() => new BubbleInk(reduced))
  const wet = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{
    width: number
    height: number
  } | null>(null)

  const [ax, ay, ox, oy] = [anchor[0], anchor[1], origin[0], origin[1]]
  const shape: BubbleShape | null = useMemo(
    () =>
      size === null
        ? null
        : {
            width: size.width,
            height: size.height,
            radius: (12 * unit) / unitOf(FIGURE_SIZE),
            anchor: [ax - ox, ay - oy],
            unit,
            seed,
            ink: strength,
          },
    [size, ax, ay, ox, oy, seed, unit, strength],
  )
  const strokes = useMemo(() => (shape === null ? [] : bubbleStrokes(shape)), [shape])
  const area = useMemo(() => (strokes.length === 0 ? null : bubbleArea(strokes)), [strokes])
  const root = useMemo(
    () => (shape === null ? null : (bubbleLines(shape).first[0] ?? null)),
    [shape],
  )

  useLayoutEffect(() => {
    ink.mount(wet.current)
    const element = wet.current?.parentElement
    if (!element) return undefined
    const measure = (): void => {
      const box = element.getBoundingClientRect()
      setSize(was =>
        was !== null && was.width === box.width && was.height === box.height
          ? was
          : { width: box.width, height: box.height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (reduced) return () => observer.disconnect()
    element.addEventListener('keydown', ink.finish, true)
    element.addEventListener('pointerdown', ink.finish, true)
    return () => {
      observer.disconnect()
      element.removeEventListener('keydown', ink.finish, true)
      element.removeEventListener('pointerdown', ink.finish, true)
    }
  }, [ink, reduced])

  useEffect(() => {
    ink.listen(onGone)
  }, [ink, onGone])
  useEffect(() => {
    ink.shape(strokes, area, root, own)
  }, [ink, strokes, area, root, own])
  useEffect(() => {
    if (closing) ink.close(reduced)
  }, [ink, closing, reduced])
  useEffect(() => () => ink.dispose(), [ink])

  const box =
    area === null
      ? { left: 0, top: 0, width: 0, height: 0 }
      : {
          left: area.x * unit,
          top: area.y * unit,
          width: area.width * unit,
          height: area.height * unit,
        }
  return (
    <>
      {area !== null && (
        <svg
          className="omne-ink-bubble-edge"
          aria-hidden="true"
          style={box}
          viewBox={`${box.left} ${box.top} ${box.width} ${box.height}`}
        >
          {strokes.map((stroke, i) => (
            <path
              key={`${seed}-${i}`}
              ref={path => ink.restPath(i, path)}
              d={stroke.rest}
              data-part={stroke.part}
            />
          ))}
        </svg>
      )}
      <div ref={wet} className="omne-ink-bubble-wet" aria-hidden="true" style={box} />
    </>
  )
}
