import type { Context } from '@deepseek-ai/cordis'
import type { ModelClock } from '@omne-harness/model-contract/provider'
import { ModelClockService, modelClockKey } from '@omne-harness/model-cordis-contract/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import type { EntryObjectModule, EntryTime } from '../types.ts'
import { waitUntil as waitUntilEpoch } from '@omne-harness/time-source'
import { epochMillisOf, readInstant } from './session-clock.ts'
import { timeOf } from './time.ts'

export function createModelClock(time: EntryTime): ModelClock {
  const now: ModelClock['now'] = () => {
    const reading = readInstant(time.source)
    if (!reading.ok)
      throw new TypeError(`modelClock.now: ${time.protocol} reading refused (${reading.failure.kind})`)
    return reading.text
  }
  const waitUntil: ModelClock['waitUntil'] = async (instant, signal) => {
    const parsed = parseInstant(instant)
    if (!parsed.ok)
      throw new TypeError(`modelClock.waitUntil: instant text refused (${parsed.failure.kind})`)
    return waitUntilEpoch(time.source, epochMillisOf(instant), signal)
  }
  return Object.freeze({ now, waitUntil })
}

class EntryModelClock extends ModelClockService {
  readonly now: ModelClock['now']
  readonly waitUntil: ModelClock['waitUntil']
  constructor(ctx: Context, clock: ModelClock) {
    super(ctx)
    this.now = () => clock.now()
    this.waitUntil = (instant, signal) => clock.waitUntil(instant, signal)
  }
}

export const modelClock: EntryObjectModule = {
  name: modelClockKey,
  implementation: 'real',
  install(scope, env) {
    new EntryModelClock(scope, createModelClock(timeOf(env)))
  },
}
