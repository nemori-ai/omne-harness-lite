import type { Context } from '@deepseek-ai/cordis'
import type { ClockReading, IdentityClock } from '@omne-harness/identity'
import { IdentityClockService, identityClockKey } from '@omne-harness/identity/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import type { EntryObjectModule, EntryTime } from '../types.ts'
import { readInstant, timeOf } from './time.ts'

export function createIdentityClock(time: EntryTime): IdentityClock {
  const now = (): Promise<ClockReading> => {
    const reading = readInstant(time.source)
    if (!reading.ok)
      return Promise.resolve(
        Object.freeze({
          kind: 'unavailable' as const,
          diagnostic: `${time.protocol}:${reading.failure.kind}`,
        }),
      )
    const parsed = parseInstant(reading.text)
    return Promise.resolve(
      parsed.ok
        ? Object.freeze({ kind: 'read' as const, instant: parsed.value })
        : Object.freeze({
            kind: 'unavailable' as const,
            diagnostic: `${time.protocol}:${parsed.failure.kind}`,
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
  install(scope, env) {
    new EntryIdentityClock(scope, createIdentityClock(timeOf(env)))
  },
}
