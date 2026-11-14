import type { Context } from '@deepseek-ai/cordis'
import type { ClockReading, IdentityClock } from '@omne-harness/identity'
import { IdentityClockService, identityClockKey } from '@omne-harness/identity/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import type { EntryObjectModule } from '../types.ts'
import { readSystemInstant } from './session-clock.ts'

export function createIdentityClock(): IdentityClock {
  const now = (): Promise<ClockReading> => {
    const reading = readSystemInstant()
    if (!reading.ok)
      return Promise.resolve(
        Object.freeze({
          kind: 'unavailable' as const,
          diagnostic: `system-clock:${reading.failure.kind}`,
        }),
      )
    const parsed = parseInstant(reading.text)
    return Promise.resolve(
      parsed.ok
        ? Object.freeze({ kind: 'read' as const, instant: parsed.value })
        : Object.freeze({
            kind: 'unavailable' as const,
            diagnostic: `system-clock:${parsed.failure.kind}`,
          }),
    )
  }
  return Object.freeze({ now })
}

class EntryIdentityClock extends IdentityClockService {
  readonly now: IdentityClock['now']
  constructor(ctx: Context, clock: IdentityClock) {
    super(ctx)
    this.now = () => clock.now()
  }
}

export const identityClock: EntryObjectModule = {
  name: identityClockKey,
  implementation: 'real',
  install(scope) {
    new EntryIdentityClock(scope, createIdentityClock())
  },
}
