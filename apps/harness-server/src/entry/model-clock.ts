// `modelClock`（AA 运行时对象表「Model 与 Tool 的原事实、权威与时钟适配对象」、model-contract `ModelClock`）：根上的入口对象，
// `model-host` 静态 inject。读数与等待取自 `session-clock.ts` 的系统时间来源。契约没有失败通道：读不到时抛出，
// 不编造读数；不能接受的时刻文本抛出，不永远等。
import type { Context } from '@deepseek-ai/cordis'
import type { ModelClock } from '@omne-harness/model-contract/provider'
import { ModelClockService, modelClockKey } from '@omne-harness/model-cordis-contract/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import type { EntryObjectModule } from '../types.ts'
import { epochMillisOf, readSystemInstant, waitUntilEpoch } from './session-clock.ts'

export function createModelClock(): ModelClock {
  const now: ModelClock['now'] = () => {
    const reading = readSystemInstant()
    if (!reading.ok)
      throw new TypeError(`modelClock.now: system clock reading refused (${reading.failure.kind})`)
    return reading.text
  }
  const waitUntil: ModelClock['waitUntil'] = async (instant, signal) => {
    const parsed = parseInstant(instant)
    if (!parsed.ok)
      throw new TypeError(`modelClock.waitUntil: instant text refused (${parsed.failure.kind})`)
    return waitUntilEpoch(epochMillisOf(instant), signal)
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
  install(scope) {
    new EntryModelClock(scope, createModelClock())
  },
}
