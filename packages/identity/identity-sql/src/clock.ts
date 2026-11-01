// The system clock of the plugin body (DP1-C16): the wall clock of the process, read as a UTC
// instant with millisecond digits. The provider, not this clock, keeps the latest adopted reading.
import type { IdentityClock } from '@omne-harness/identity'
import { parseInstant } from '@omne-harness/utc-instant'

export function systemIdentityClock(): IdentityClock {
  return Object.freeze({
    now() {
      const parsed = parseInstant(
        new Date(
          /* wall-clock: clock-source -- This is the IdentityClock the plugin body builds (DP1-C16). */ Date.now(),
        ).toISOString(),
      )
      return Promise.resolve(
        parsed.ok
          ? Object.freeze({ kind: 'read' as const, instant: parsed.value })
          : Object.freeze({
              kind: 'unavailable' as const,
              diagnostic: `system-clock:${parsed.failure.kind}`,
            }),
      )
    },
  })
}
