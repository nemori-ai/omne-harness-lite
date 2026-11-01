// `agentClock`（AA 运行时对象表「时钟」、agent-contract `AgentClock`）：根上的入口对象，`agent-host` 静态 inject。
// 读数与等待取自 `session-clock.ts` 的系统时间来源，经 agent-contract 的 `Reply` 通道作答：读不到时 `unavailable`，
// 不能接受的时刻文本 `invalid`，不编造读数，也不永远等。
import type { Context } from '@deepseek-ai/cordis'
import type { AgentClock } from '@omne-harness/agent-contract'
import { AgentClockService, agentClockKey } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import { parseInstant } from '@omne-harness/utc-instant'
import type { EntryObjectModule } from '../types.ts'
import { epochMillisOf, readSystemInstant, waitUntilEpoch } from './session-clock.ts'

export function createAgentClock(): AgentClock {
  const now: AgentClock['now'] = () => {
    const reading = readSystemInstant()
    return Promise.resolve(
      reading.ok
        ? succeed(reading.text)
        : fail({
            kind: 'unavailable',
            owner: 'agent-clock',
            diagnostic: `system-clock:${reading.failure.kind}`,
          }),
    )
  }
  const waitUntil: AgentClock['waitUntil'] = async (instant, signal) => {
    const parsed = parseInstant(instant)
    if (!parsed.ok) return fail({ kind: 'invalid', field: 'instant', reason: parsed.failure.kind })
    return succeed(await waitUntilEpoch(epochMillisOf(instant), signal))
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
  install(scope) {
    new EntryAgentClock(scope, createAgentClock())
  },
}
