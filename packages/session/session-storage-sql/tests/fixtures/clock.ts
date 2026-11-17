import { fail, succeed } from '@omne-harness/operation-result'
import type { ClockSample, SessionClock } from '@omne-harness/session-contract'
import { adoption, evidence } from '@omne-harness/session-contract/testing'

// A clock that answers the given times in order; null, and every reading past the end, is unavailable.
export function clockOf(times: readonly (string | null)[]): Pick<SessionClock, 'sample'> {
  let next = 0
  return {
    sample: () => {
      const at = times[next++] ?? null
      if (at === null)
        return Promise.resolve(
          fail({ kind: 'unavailable', owner: 'clock', diagnostic: 'no reading' }),
        )
      const sample: ClockSample = {
        at,
        protocol: adoption('clock'),
        source: evidence(`clock/${at}`),
      }
      return Promise.resolve(succeed(sample))
    },
  }
}

export const T = (second: number) => `2026-11-13T00:00:${String(second).padStart(2, '0')}.000Z`
