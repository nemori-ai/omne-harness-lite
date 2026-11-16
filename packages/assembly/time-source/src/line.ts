import { WaitQueue } from './queue.ts'
import { finite } from './source.ts'

export type TimelineEntry = Readonly<{
  event: 'wait' | 'fire' | 'cancel' | 'wall'
  wait: number | null
  elapsed: number
  now: number
}>

export type WaitBase = 'elapsed' | 'wall'

type Wait = {
  readonly id: number
  readonly base: WaitBase
  readonly target: number
  readonly fire: () => void
  slot: number
}

export const SPIN_LIMIT = 10_000
export const ALREADY_ADVANCING = 'the time source is already advancing'

export class Line {
  elapsed = 0
  #offset: number
  #registered = 0
  #bornBefore = 0
  #stepping = false
  readonly #waits = new Map<number, Wait>()
  readonly #queues = { elapsed: new WaitQueue<Wait>(), wall: new WaitQueue<Wait>() }
  readonly #record: TimelineEntry[] | null

  constructor(options: Readonly<{ wall?: number; record?: boolean }>) {
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

  add(base: WaitBase, target: number, fire: () => void): number {
    this.#registered += 1
    const wait: Wait = { id: this.#registered, base, target, fire, slot: 0 }
    this.#waits.set(wait.id, wait)
    this.#queues[base].add(wait)
    this.#note('wait', wait.id)
    return wait.id
  }

  remove(id: number): void {
    const wait = this.#waits.get(id)
    if (wait === undefined) return
    this.#drop(wait)
    this.#note('cancel', id)
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
