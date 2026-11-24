import type { Context } from '@deepseek-ai/cordis'
import type { AgentClock } from '@omne-harness/agent-contract'
import { AgentClockService, agentClockKey } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { parseInstant } from '@omne-harness/utc-instant'
import type { EntryObjectModule, EntryTime } from '../types.ts'
import { waitUntil as waitUntilEpoch } from '@omne-harness/time-source'
import { epochMillisOf } from './session-clock.ts'
import { readInstant, timeOf } from './time.ts'

export function createAgentClock(time: EntryTime): AgentClock {
  const now: AgentClock['now'] = () => {
    const reading = readInstant(time.source)
    return Promise.resolve(
      reading.ok
        ? succeed(reading.text)
        : fail({
            kind: 'unavailable',
            owner: 'agent-clock',
            diagnostic: `${time.protocol}:${reading.failure.kind}`,
          }),
    )
  }
  const waitUntil: AgentClock['waitUntil'] = async (instant, signal) => {
    const parsed = parseInstant(instant)
    if (!parsed.ok) return fail({ kind: 'invalid', field: 'instant', reason: parsed.failure.kind })
    return succeed(await waitUntilEpoch(time.source, epochMillisOf(instant), signal))
  }
  return Object.freeze({ now, waitUntil })
}

class EntryAgentClock extends AgentClockService {
  readonly now: AgentClock['now']
  readonly waitUntil: AgentClock['waitUntil']
  constructor(ctx: Context, clock: AgentClock) {
    super(ctx)
    this.now = () => clock.now()
    this.waitUntil = (instant, signal) => clock.waitUntil(instant, signal)
  }
}

export const agentClock: EntryObjectModule = {
  name: agentClockKey,
  implementation: 'real',
  install(scope, env) {
    new EntryAgentClock(scope, createAgentClock(timeOf(env)))
  },
}
