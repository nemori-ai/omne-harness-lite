import { parseInstant } from '@omne-harness/utc-instant'
import type { DispatchInstants } from '@omne-harness/model-contract'
import type { ModelClock } from '@omne-harness/model-contract/provider'
import type { DispatchDocument } from './types.ts'

export const NO_INSTANTS: DispatchInstants = Object.freeze({
  prepared: null,
  sent: null,
  responseStarted: null,
  firstContent: null,
  ended: null,
})

export const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && parseInstant(value).ok

/** A moment from the clock, or null when the clock throws or gives no UTC instant; the call goes on either way. */
export function readInstant(clock: Pick<ModelClock, 'now'>): string | null {
  try {
    const value = clock.now()
    return isInstant(value) ? value : null
  } catch {
    return null
  }
}

/** Keeps a moment once: a moment already kept is never rewritten, and a moment the clock did not give is not kept. */
export function keepInstant(
  dispatch: DispatchDocument,
  moment: keyof DispatchInstants,
  value: string | null,
): void {
  const instants = dispatch.record.instants ?? NO_INSTANTS
  if (value === null || instants[moment] !== null) return
  dispatch.record = { ...dispatch.record, instants: { ...instants, [moment]: value } }
}

/** Arrivals, when given, name one moment or null for each fact. */
export const arrivalsFit = (
  facts: readonly unknown[],
  arrivals: readonly (string | null)[] | undefined,
): boolean =>
  arrivals === undefined ||
  (Array.isArray(arrivals) &&
    arrivals.length === facts.length &&
    arrivals.every(arrival => arrival === null || isInstant(arrival)))
