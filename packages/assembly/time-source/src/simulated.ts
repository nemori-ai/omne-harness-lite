import { WaitQueue } from './queue.ts'
import { finite, type Cancel, type TimeSource } from './source.ts'
import { HOST_TIMER_LIMIT_MS } from './system.ts'

export type TimelineEntry = Readonly<{
  event: 'wait' | 'fire' | 'cancel' | 'wall'
  wait: number | null
  elapsed: number
  now: number
}>

export type Pace = 'manual' | 'idle-jump' | Readonly<{ speed: number }>

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

type Wait = {
  readonly id: number
  readonly base: 'elapsed' | 'wall'
  readonly target: number
  readonly fire: () => void
  slot: number
}

const SPIN_LIMIT = 10_000
const ALREADY_ADVANCING = 'the time source is already advancing'

const hostImmediate = setImmediate
const hostTimeout = setTimeout
const hostClearTimeout = clearTimeout
const hostElapsed = (): number =>
  /* wall-clock: operation-timing -- the scaled pace follows the host monotonic clock */ performance.now()

function checkedPace(pace: Pace): Pace {
  if (pace === 'manual' || pace === 'idle-jump') return pace
  if (!(finite('speed', pace.speed) > 0)) throw new TypeError('speed must be positive')
  return { speed: pace.speed }
}

class Line {
  elapsed = 0
  #offset: number
  #registered = 0
  #bornBefore = 0
  #stepping = false
  readonly #waits = new Map<number, Wait>()
  readonly #queues = { elapsed: new WaitQueue<Wait>(), wall: new WaitQueue<Wait>() }
  readonly #record: TimelineEntry[] | null

  constructor(options: SimulatedTimeOptions) {
    this.#offset = finite('wall', options.wall ?? 0)
    this.#record = options.record === true ? [] : null
  }

  get now(): number {
    return this.#offset + this.elapsed
  }

  get pending(): number {
    return this.#waits.size
  }

  get stepping(): boolean {
    return this.#stepping
  }

  earliest(): number | undefined {
    const first = this.#first()
    return first === undefined ? undefined : this.#position(first)
  }

  add(base: Wait['base'], target: number, fire: () => void): number {
    this.#registered += 1
    const wait: Wait = { id: this.#registered, base, target, fire, slot: 0 }
    this.#waits.set(wait.id, wait)
    this.#queues[base].add(wait)
    this.#note('wait', wait.id)
    return wait.id
  }

  remove(id: number): boolean {
    const wait = this.#waits.get(id)
    if (wait === undefined) return false
    this.#drop(wait)
    this.#note('cancel', id)
    return true
  }

  step<T>(run: () => T): T {
    if (this.#stepping) throw new TypeError(ALREADY_ADVANCING)
    this.#stepping = true
    this.#bornBefore = this.#registered
    try {
      return run()
    } finally {
      this.#stepping = false
    }
  }

  setWall(epochMs: number): void {
    this.#offset = epochMs - this.elapsed
    this.#note('wall', null)
    this.fireThrough(this.elapsed)
  }

  fireThrough(end: number): void {
    let spins = 0
    let spinAt = Number.NaN
    for (
      let wait = this.#first();
      wait !== undefined && this.#position(wait) <= end;
      wait = this.#first()
    ) {
      this.elapsed = Math.max(this.elapsed, this.#position(wait))
      if (wait.id > this.#bornBefore) {
        spins = this.elapsed === spinAt ? spins + 1 : 1
        spinAt = this.elapsed
        if (spins > SPIN_LIMIT)
          throw new Error(`more than ${String(SPIN_LIMIT)} new waits fired without time passing`)
      }
      this.#drop(wait)
      this.#note('fire', wait.id)
      wait.fire()
    }
  }

  timeline(): readonly TimelineEntry[] {
    return this.#record === null ? [] : [...this.#record]
  }

  #position(wait: Wait): number {
    return wait.base === 'elapsed' ? wait.target : wait.target - this.#offset
  }

  #first(): Wait | undefined {
    const elapsed = this.#queues.elapsed.peek()
    const wall = this.#queues.wall.peek()
    if (elapsed === undefined || wall === undefined) return elapsed ?? wall
    const gap = this.#position(wall) - this.#position(elapsed)
    return gap < 0 || (gap === 0 && wall.id < elapsed.id) ? wall : elapsed
  }

  #drop(wait: Wait): void {
    this.#waits.delete(wait.id)
    this.#queues[wait.base].remove(wait)
  }

  #note(event: TimelineEntry['event'], wait: number | null): void {
    this.#record?.push(Object.freeze({ event, wait, elapsed: this.elapsed, now: this.now }))
  }
}

class Pacer {
  readonly #line: Line
  #pace: Pace = 'manual'
  #holds = 0
  #jumpQueued = false
  #hostTimer: ReturnType<typeof setTimeout> | undefined
  #anchor = 0

  constructor(line: Line) {
    this.#line = line
  }

  read(): number {
    this.#follow()
    return this.#line.elapsed
  }

  drive<T>(step: () => T): T {
    if (this.#line.stepping) throw new TypeError(ALREADY_ADVANCING)
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
    const checked = checkedPace(pace)
    if (this.#line.stepping) throw new TypeError(ALREADY_ADVANCING)
    this.#follow()
    this.#disarm()
    this.#pace = checked
    this.#anchor = hostElapsed()
    this.settle()
  }

  settle(): void {
    if (this.#line.stepping) return
    if (this.#pace === 'idle-jump') this.#queueJump()
    else if (typeof this.#pace === 'object') this.#arm(this.#pace.speed)
  }

  #queueJump(): void {
    if (this.#jumpQueued || this.#holds > 0 || this.#line.pending === 0) return
    this.#jumpQueued = true
    hostImmediate(() => {
      this.#jumpQueued = false
      if (this.#pace === 'idle-jump' && this.#holds === 0 && !this.#line.stepping) this.jump()
    })
  }

  #arm(speed: number): void {
    this.#disarm()
    const earliest = this.#line.earliest()
    if (earliest === undefined) return
    this.#follow()
    const hostDelay = Math.max(0, (earliest - this.#line.elapsed) / speed)
    this.#hostTimer = hostTimeout(
      () => this.drive(() => this.#line.fireThrough(this.#line.elapsed)),
      Math.min(hostDelay, HOST_TIMER_LIMIT_MS),
    )
  }

  #disarm(): void {
    hostClearTimeout(this.#hostTimer)
    this.#hostTimer = undefined
  }

  #follow(): void {
    if (typeof this.#pace !== 'object' || this.#line.stepping) return
    const host = hostElapsed()
    this.#line.elapsed += (host - this.#anchor) * this.#pace.speed
    this.#anchor = host
  }
}

export function simulatedTime(options: SimulatedTimeOptions = {}): SimulatedTime {
  const line = new Line(options)
  const pacer = new Pacer(line)

  const register = (base: Wait['base'], target: number, fire: () => void): Cancel => {
    const id = line.add(base, target, fire)
    pacer.settle()
    return () => {
      if (line.remove(id)) pacer.settle()
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
