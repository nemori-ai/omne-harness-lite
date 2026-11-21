import { ALREADY_ADVANCING, Line, type TimelineEntry, type WaitBase } from './line.ts'
import { finite, type Cancel, type TimeSource } from './source.ts'
import { systemTime } from './system.ts'

export type { TimelineEntry } from './line.ts'

export type Pace = 'manual' | 'idle-jump' | Readonly<{ speed: number; follow?: TimeSource }>

export type SimulatedTime = Readonly<{
  source: TimeSource
  advance(ms: number): void
  next(): boolean
  setWall(epochMs: number): void
  hold(): () => void
  pending(): number
  run(pace: Pace): void
  timeline(): readonly TimelineEntry[]
}>

export type SimulatedTimeOptions = Readonly<{ wall?: number; record?: boolean }>

type Scaled = Readonly<{ speed: number; host: TimeSource }>
type Mode = 'manual' | 'idle-jump' | Scaled

const hostImmediate = setImmediate

function modeOf(pace: Pace): Mode {
  if (pace === 'manual' || pace === 'idle-jump') return pace
  if (!(finite('speed', pace.speed) > 0)) throw new TypeError('speed must be positive')
  return { speed: pace.speed, host: pace.follow ?? systemTime() }
}

class Pacer {
  readonly #line: Line
  #mode: Mode = 'manual'
  #holds = 0
  #jumpQueued = false
  #hostWait: Cancel | undefined
  #anchor = 0

  constructor(line: Line) {
    this.#line = line
  }

  read(): number {
    this.#follow()
    return this.#line.elapsed
  }

  drive<T>(step: () => T): T {
    this.#follow()
    try {
      return this.#line.step(step)
    } finally {
      this.settle()
    }
  }

  jump(): boolean {
    return this.drive(() => {
      const earliest = this.#line.earliest()
      if (earliest === undefined) return false
      this.#line.fireThrough(Math.max(this.#line.elapsed, earliest))
      return true
    })
  }

  hold(): () => void {
    this.#holds += 1
    let held = true
    return () => {
      if (!held) return
      held = false
      this.#holds -= 1
      this.settle()
    }
  }

  run(pace: Pace): void {
    const mode = modeOf(pace)
    if (this.#line.stepping) throw new TypeError(ALREADY_ADVANCING)
    this.#follow()
    this.#disarm()
    this.#mode = mode
    if (typeof mode === 'object') this.#anchor = mode.host.elapsed()
    this.settle()
  }

  settle(): void {
    if (this.#mode === 'idle-jump') this.#queueJump()
    else if (typeof this.#mode === 'object') this.#arm(this.#mode)
  }

  #queueJump(): void {
    if (this.#jumpQueued || this.#line.pending === 0) return
    this.#jumpQueued = true
    hostImmediate(() => {
      this.#jumpQueued = false
      if (this.#mode === 'idle-jump' && this.#holds === 0) this.jump()
    })
  }

  #arm(scaled: Scaled): void {
    this.#disarm()
    const earliest = this.#line.earliest()
    if (earliest === undefined) return
    this.#follow()
    this.#hostWait = scaled.host.after((earliest - this.#line.elapsed) / scaled.speed, () =>
      this.drive(() => this.#line.fireThrough(this.#line.elapsed)),
    )
  }

  #disarm(): void {
    this.#hostWait?.()
    this.#hostWait = undefined
  }

  #follow(): void {
    if (typeof this.#mode !== 'object' || this.#line.stepping) return
    const host = this.#mode.host.elapsed()
    this.#line.elapsed += (host - this.#anchor) * this.#mode.speed
    this.#anchor = host
  }
}

export function simulatedTime(options: SimulatedTimeOptions = {}): SimulatedTime {
  const line = new Line(options)
  const pacer = new Pacer(line)

  const register = (base: WaitBase, target: number, fire: () => void): Cancel => {
    const id = line.add(base, target, fire)
    pacer.settle()
    return () => {
      line.remove(id)
      pacer.settle()
    }
  }

  const source: TimeSource = Object.freeze({
    now() {
      pacer.read()
      return line.now
    },
    elapsed: () => pacer.read(),
    after(delayMs, fire) {
      const delay = Math.max(0, finite('delayMs', delayMs))
      return register('elapsed', pacer.read() + delay, fire)
    },
    at: (epochMs, fire) => register('wall', finite('epochMs', epochMs), fire),
  })

  return Object.freeze({
    source,
    advance(ms) {
      if (finite('ms', ms) < 0) throw new TypeError('ms must not be negative')
      pacer.drive(() => {
        const end = line.elapsed + ms
        line.fireThrough(end)
        line.elapsed = end
      })
    },
    next: () => pacer.jump(),
    setWall(epochMs) {
      finite('epochMs', epochMs)
      pacer.drive(() => line.setWall(epochMs))
    },
    hold: () => pacer.hold(),
    pending: () => line.pending,
    run: pace => pacer.run(pace),
    timeline: () => line.timeline(),
  })
}
