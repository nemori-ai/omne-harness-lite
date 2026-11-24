import type { Context } from '@deepseek-ai/cordis'
import { systemTime, type TimeSource } from '@omne-harness/time-source'
import { parseInstant, type InstantFailure } from '@omne-harness/utc-instant'
import type { EntryEnv, EntryTime } from '../types.ts'

const TIME = Symbol('entry time')

export const hostTime = (): EntryTime =>
  Object.freeze({ source: systemTime(), protocol: 'system-clock' })

export const timeOf = (env: EntryEnv): EntryTime => env.time ?? env.once(TIME, hostTime)

const runs = new WeakMap<Context, EntryTime>()

/** The entry hands the one time source of this run to its rows; a run holds one and keeps it. */
export function holdRunTime(root: Context, time: EntryTime): void {
  const held = runs.get(root)
  if (held !== undefined && held !== time) throw new Error('this run already holds another time')
  runs.set(root, time)
}

export function runTimeOf(ctx: Context): TimeSource {
  const held = runs.get(ctx.root)
  if (held === undefined) throw new Error('no time for this run: the entry did not hand one over')
  return held.source
}

export type SystemInstant =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; failure: InstantFailure }>

export function readInstant(time: TimeSource): SystemInstant {
  const text = new Date(time.now()).toISOString()
  const parsed = parseInstant(text)
  return parsed.ok ? { ok: true, text } : { ok: false, failure: parsed.failure }
}

/** The instant text of a time source's wall clock; a clock that cannot answer fails the call. */
export function readInstantText(time: TimeSource, owner = 'the'): string {
  const instant = readInstant(time)
  if (!instant.ok) throw new Error(`${owner} clock unavailable`)
  return instant.text
}

/** The instant text of this run's wall clock, read by a row. */
export const instantTextOf = (ctx: Context, owner: string): string =>
  readInstantText(runTimeOf(ctx), owner)
