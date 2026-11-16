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

type Wait = Readonly<{ id: number; base: 'elapsed' | 'wall'; target: number; fire: () => void }>

const SPIN_LIMIT = 10_000

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

export function simulatedTime(options: SimulatedTimeOptions = {}): SimulatedTime {
  let elapsed = 0
  let offset = finite('wall', options.wall ?? 0)
  let registered = 0
  let bornBefore = 0
  let holds = 0
  let firing = false
  let pace: Pace = 'manual'
  let jumpQueued = false
  let hostTimer: ReturnType<typeof setTimeout> | undefined
  let anchor = 0
  const waits = new Map<number, Wait>()
  const record: TimelineEntry[] | null = options.record === true ? [] : null

  const position = (wait: Wait): number =>
    wait.base === 'elapsed' ? wait.target : wait.target - offset

  const note = (event: TimelineEntry['event'], wait: number | null): void => {
    record?.push(Object.freeze({ event, wait, elapsed, now: offset + elapsed }))
  }

  const earliest = (): Wait | undefined => {
    let first: Wait | undefined
    for (const wait of waits.values())
      if (first === undefined || position(wait) < position(first)) first = wait
    return first
  }

  const follow = (): void => {
    if (typeof pace !== 'object' || firing) return
    const host = hostElapsed()
    elapsed += (host - anchor) * pace.speed
    anchor = host
  }

  const fireThrough = (end: number): void => {
    let spins = 0
    let spinAt = Number.NaN
    for (let wait = earliest(); wait !== undefined && position(wait) <= end; wait = earliest()) {
      elapsed = Math.max(elapsed, position(wait))
      if (wait.id > bornBefore) {
        spins = elapsed === spinAt ? spins + 1 : 1
        spinAt = elapsed
        if (spins > SPIN_LIMIT)
          throw new Error(`more than ${String(SPIN_LIMIT)} new waits fired without time passing`)
      }
      waits.delete(wait.id)
      note('fire', wait.id)
      wait.fire()
    }
  }

  const drive = <T>(step: () => T): T => {
    if (firing) throw new TypeError('the time source is already advancing')
    follow()
    firing = true
    bornBefore = registered
    try {
      return step()
    } finally {
      firing = false
      settle()
    }
  }

  const jump = (): boolean =>
    drive(() => {
      const wait = earliest()
      if (wait === undefined) return false
      fireThrough(Math.max(elapsed, position(wait)))
      return true
    })

  const settle = (): void => {
    if (firing) return
    if (pace === 'idle-jump') {
      if (jumpQueued || holds > 0 || waits.size === 0) return
      jumpQueued = true
      hostImmediate(() => {
        jumpQueued = false
        if (pace === 'idle-jump' && holds === 0 && !firing) jump()
      })
      return
    }
    if (typeof pace !== 'object') return
    hostClearTimeout(hostTimer)
    hostTimer = undefined
    const wait = earliest()
    if (wait === undefined) return
    follow()
    const hostDelay = Math.max(0, (position(wait) - elapsed) / pace.speed)
    hostTimer = hostTimeout(
      () => drive(() => fireThrough(elapsed)),
      Math.min(hostDelay, HOST_TIMER_LIMIT_MS),
    )
  }

  const register = (base: Wait['base'], target: number, fire: () => void): Cancel => {
    registered += 1
    const id = registered
    waits.set(id, { id, base, target, fire })
    note('wait', id)
    settle()
    return () => {
      if (!waits.delete(id)) return
      note('cancel', id)
      settle()
    }
  }

  const read = (): number => {
    follow()
    return elapsed
  }

  const source: TimeSource = Object.freeze({
    now: () => offset + read(),
    elapsed: read,
    after(delayMs, fire) {
      const delay = Math.max(0, finite('delayMs', delayMs))
      return register('elapsed', read() + delay, fire)
    },
    at: (epochMs, fire) => register('wall', finite('epochMs', epochMs), fire),
  })

  return Object.freeze({
    source,
    advance(ms) {
      if (finite('ms', ms) < 0) throw new TypeError('ms must not be negative')
      drive(() => {
        const end = elapsed + ms
        fireThrough(end)
        elapsed = end
      })
    },
    next: jump,
    setWall(epochMs) {
      finite('epochMs', epochMs)
      drive(() => {
        offset = epochMs - elapsed
        note('wall', null)
        fireThrough(elapsed)
      })
    },
    hold() {
      holds += 1
      let held = true
      return () => {
        if (!held) return
        held = false
        holds -= 1
        settle()
      }
    },
    pending: () => waits.size,
    run(next) {
      const checked = checkedPace(next)
      if (firing) throw new TypeError('the time source is already advancing')
      follow()
      hostClearTimeout(hostTimer)
      hostTimer = undefined
      pace = checked
      anchor = hostElapsed()
      settle()
    },
    timeline: () => (record === null ? [] : [...record]),
  })
}
