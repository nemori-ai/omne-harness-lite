import type { SimulatedTime } from '@omne-harness/time-source/simulated'

/** A control line the driver of a lab instance sends on its standard input. */
export type LabCommand =
  | Readonly<{ kind: 'read' }>
  | Readonly<{ kind: 'skip'; ms: number }>
  | Readonly<{ kind: 'set'; wall: number }>
  | Readonly<{ kind: 'speed'; factor: number }>

export type LabReading = Readonly<{
  wall: string
  elapsed: number
  pending: number
  speed: number
}>

export type LabReply =
  | (LabReading & Readonly<{ ok: true; command: LabCommand['kind']; fired: number }>)
  | Readonly<{ ok: false; error: string }>

const UNITS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

/** `90s`, `15m`, `3h`, `2d` or plain milliseconds; at least one millisecond. */
export function parseDuration(text: string): number | undefined {
  const match = /^(\d+)(ms|s|m|h|d)?$/u.exec(text.trim())
  if (match === null) return undefined
  const ms = Number(match[1]) * (UNITS[match[2] ?? 'ms'] ?? 1)
  return Number.isSafeInteger(ms) && ms > 0 ? ms : undefined
}

export function parseCommand(line: string): LabCommand | string {
  const [word, argument, extra] = line.trim().split(/\s+/u)
  if (extra !== undefined) return `too many words: ${line.trim()}`
  switch (word) {
    case 'read':
      return argument === undefined ? { kind: 'read' } : 'read takes nothing'
    case 'skip': {
      const ms = argument === undefined ? undefined : parseDuration(argument)
      return ms === undefined
        ? 'skip takes a duration such as 90s, 15m, 3h or 2d'
        : { kind: 'skip', ms }
    }
    case 'set': {
      const wall = argument === undefined ? Number.NaN : Date.parse(argument)
      return (argument ?? '').endsWith('Z') && Number.isFinite(wall)
        ? { kind: 'set', wall }
        : 'set takes a UTC instant such as 2027-01-31T08:59:00Z'
    }
    case 'speed': {
      const factor = Number(argument)
      return argument !== undefined && Number.isFinite(factor) && factor > 0
        ? { kind: 'speed', factor }
        : 'speed takes a positive factor'
    }
    default:
      return `unknown command: ${word ?? ''}; the commands are read, skip, set and speed`
  }
}

export type LabClock = Readonly<{
  time: SimulatedTime
  /** How many waits have fired on this time so far. */
  fired(): number
  speed(): number
  setSpeed(factor: number): void
}>

export function readingOf(clock: LabClock): LabReading {
  return {
    wall: new Date(clock.time.source.now()).toISOString(),
    elapsed: Math.floor(clock.time.source.elapsed()),
    pending: clock.time.pending(),
    speed: clock.speed(),
  }
}

/** Applies one command. A skip moves the wall clock only: the monotonic reading stays, as across a stop. */
export function applyCommand(clock: LabClock, command: LabCommand): LabReply {
  const before = clock.fired()
  if (command.kind === 'skip') clock.time.setWall(clock.time.source.now() + command.ms)
  if (command.kind === 'set') clock.time.setWall(command.wall)
  if (command.kind === 'speed') clock.setSpeed(command.factor)
  return { ok: true, command: command.kind, ...readingOf(clock), fired: clock.fired() - before }
}

export function answer(clock: LabClock, line: string): LabReply {
  const command = parseCommand(line)
  return typeof command === 'string' ? { ok: false, error: command } : applyCommand(clock, command)
}
