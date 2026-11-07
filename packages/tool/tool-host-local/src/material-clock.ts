import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialInstant,
  type ToolMaterialClock,
  type ToolMaterialInstant,
} from '@omne-harness/tool-contract/provider'

export type LocalToolMaterialClockInput = Readonly<{
  wallMs: () => number
  monotonicMs: () => number
}>

type Anchor = Readonly<{ value: number; monotonic: number }>
const usable = (value: number): boolean =>
  Number.isFinite(value) && Math.abs(value) <= 8_640_000_000_000_000
const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'material-clock', diagnostic })

/** M05's local time source; Tool, not this factory, persists the high watermark. */
export function createLocalToolMaterialClock(
  input: LocalToolMaterialClockInput,
): ToolMaterialClock {
  if (typeof input?.wallMs !== 'function' || typeof input?.monotonicMs !== 'function')
    throw new TypeError('material clock requires wallMs and monotonicMs sources')
  let anchor: Anchor | null = null

  const sample = (): Outcome<ToolMaterialInstant, ToolFailure> => {
    let wall: number
    let monotonic: number
    try {
      wall = input.wallMs()
      monotonic = input.monotonicMs()
    } catch {
      return unavailable('time source failed')
    }
    if (!usable(wall) || !usable(monotonic)) return unavailable('invalid time sample')
    if (anchor !== null && monotonic < anchor.monotonic)
      return unavailable('monotonic time moved backwards')
    const value =
      anchor === null ? wall : Math.max(wall, anchor.value + (monotonic - anchor.monotonic))
    if (!usable(value)) return unavailable('effective time is outside the date range')
    const instant = decodeToolMaterialInstant(new Date(value).toISOString())
    if ('failure' in instant) return unavailable('invalid effective time')
    anchor = { value, monotonic }
    return instant
  }
  return Object.freeze({ sample: () => Promise.resolve(sample()) })
}
