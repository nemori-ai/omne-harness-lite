import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TimeSource } from '@omne-harness/time-source'
import { simulatedTime } from '@omne-harness/time-source/simulated'
import { hostTime } from '../entry/time.ts'
import type { LabClock } from './control.ts'

export const LAB_TIME = 'lab-time.json'

export type SavedTime = Readonly<{ wall: number; speed: number }>

/** The reading a lab instance left in its state directory; undefined when it left none. */
export function readSavedTime(dir: string): SavedTime | undefined {
  let text: string
  try {
    text = readFileSync(join(dir, LAB_TIME), 'utf8')
  } catch {
    return undefined
  }
  const saved = JSON.parse(text) as Partial<SavedTime>
  if (!Number.isFinite(saved.wall) || !(Number(saved.speed) > 0))
    throw new Error(`${LAB_TIME} in ${dir} does not hold a wall reading and a speed`)
  return { wall: Number(saved.wall), speed: Number(saved.speed) }
}

export function saveTime(dir: string, saved: SavedTime): void {
  const file = join(dir, LAB_TIME)
  writeFileSync(`${file}.next`, `${JSON.stringify(saved)}\n`, { mode: 0o600 })
  renameSync(`${file}.next`, file)
}

/** A simulated time that follows the system time at a speed, and counts the waits that fire on it. */
export function createLabClock(start: SavedTime): LabClock & Readonly<{ source: TimeSource }> {
  const time = simulatedTime({ wall: start.wall })
  const host = hostTime().source
  let speed = start.speed
  let fired = 0
  const counted = (fire: () => void) => () => {
    fired += 1
    fire()
  }
  const setSpeed = (factor: number) => {
    speed = factor
    time.run({ speed: factor, follow: host })
  }
  setSpeed(speed)
  const source: TimeSource = Object.freeze({
    now: () => time.source.now(),
    elapsed: () => time.source.elapsed(),
    after: (delayMs, fire, options) => time.source.after(delayMs, counted(fire), options),
    at: (epochMs, fire, options) => time.source.at(epochMs, counted(fire), options),
  })
  return { time, source, fired: () => fired, speed: () => speed, setSpeed }
}
