// `sessionClock`（AA 运行时对象表「时钟」、session-contract `SessionClock`）：根上的入口对象，`session-provider`
// 按调用现取。它读宿主系统时间；读数经 utc-instant 校验后才交出，校验不过时答 `unavailable`，不编造读数。
// 本文件也是两个时钟入口对象共用的系统时间来源：`agent-clock.ts` 从这里取读数与等待，不自己读墙钟。
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Adoption } from '@omne-harness/exchange-refs'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ClockSample, SessionClock } from '@omne-harness/session-contract'
import { SessionClockService, sessionClockKey } from '@omne-harness/session-cordis-contract/cordis'
import { parseInstant, type InstantFailure } from '@omne-harness/utc-instant'
import type { EntryObjectModule } from '../types.ts'

// ---- 系统时间（两个时钟共用） ----

export type SystemInstant =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; failure: InstantFailure }>

/** 读宿主系统时间，作为 RFC 3339 UTC 文本（毫秒位）。utc-instant 不接受时不交出读数。 */
export function readSystemInstant(): SystemInstant {
  const text = new Date(
    /* wall-clock: clock-source -- the sessionClock and agentClock entry objects are the clock the assembly provides (AA runtime objects, 时钟). */ Date.now(),
  ).toISOString()
  const parsed = parseInstant(text)
  return parsed.ok ? { ok: true, text } : { ok: false, failure: parsed.failure }
}

/**
 * 已校验时刻文本的宿主纪元毫秒。闰秒（秒位 60）`Date` 不认，按该分钟的 59 秒再加一秒计。
 * 调用方先用 `parseInstant` 校验；没校验的文本在这里抛 TypeError。
 */
export function epochMillisOf(instantText: string): number {
  const direct = Date.parse(instantText)
  if (!Number.isNaN(direct)) return direct
  const beforeLeap = Date.parse(instantText.replace(/:60(?=[.Z])/u, ':59'))
  if (Number.isNaN(beforeLeap)) throw new TypeError('instant text is outside the host clock range')
  return beforeLeap + 1000
}

/** `setTimeout` 能接受的最长延时。更远的时刻分段等，每段到期后重新读时间。 */
const MAX_DELAY_MS = 2_147_483_647

/** 等到 `targetMs` 或 `signal` 中止。已中止的信号立即答 `cancelled`，已过去的时刻立即答 `elapsed`。 */
export function waitUntilEpoch(
  targetMs: number,
  signal: AbortSignal,
): Promise<'elapsed' | 'cancelled'> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve('cancelled')
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (answer: 'elapsed' | 'cancelled'): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve(answer)
    }
    const onAbort = (): void => finish('cancelled')
    const arm = (): void => {
      const remaining =
        targetMs -
        /* wall-clock: operation-timing -- how long until the target instant; the domain reading is readSystemInstant. */ Date.now()
      if (remaining <= 0) {
        finish('elapsed')
        return
      }
      timer = setTimeout(arm, Math.min(remaining, MAX_DELAY_MS))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    arm()
  })
}

// ---- sessionClock ----

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const OWNER = 'harness-server'
const PROTOCOL_NAME = 'system-clock'
const REVISION = '1'

/** 采样协议：宿主系统时钟，读数即 `at`。 */
const PROTOCOL: Adoption = Object.freeze({
  owner: OWNER,
  name: PROTOCOL_NAME,
  revision: REVISION,
  digest: sha256(`${OWNER}/${PROTOCOL_NAME}/${REVISION}`),
})

export function createSessionClock(): SessionClock {
  // 本进程内的采样序号；采样的证据定位本次运行里的这一次读数，不是耐久记录。
  let ordinal = 0
  const sample: SessionClock['sample'] = () => {
    const reading = readSystemInstant()
    if (!reading.ok)
      return Promise.resolve(
        fail({
          kind: 'unavailable',
          owner: 'clock',
          diagnostic: `system-clock:${reading.failure.kind}`,
        }),
      )
    ordinal += 1
    const record = `${PROTOCOL_NAME}/sample/${ordinal}`
    const value: ClockSample = Object.freeze({
      at: reading.text,
      protocol: PROTOCOL,
      source: Object.freeze({
        owner: OWNER,
        record,
        revision: REVISION,
        digest: sha256(JSON.stringify([record, reading.text])),
      }),
    })
    return Promise.resolve(succeed(value))
  }
  const waitUntil: SessionClock['waitUntil'] = async (instant, signal) => {
    const parsed = parseInstant(instant)
    // 契约没有失败通道：不能接受的时刻文本不等（否则永远不醒），抛出给调用方。
    if (!parsed.ok)
      throw new TypeError(`sessionClock.waitUntil: instant text refused (${parsed.failure.kind})`)
    return waitUntilEpoch(epochMillisOf(instant), signal)
  }
  return Object.freeze({ sample, waitUntil })
}

class EntrySessionClock extends SessionClockService {
  readonly sample: SessionClock['sample']
  readonly waitUntil: SessionClock['waitUntil']
  constructor(ctx: Context, clock: SessionClock) {
    super(ctx)
    this.sample = () => clock.sample()
    this.waitUntil = (instant, signal) => clock.waitUntil(instant, signal)
  }
}

export const sessionClock: EntryObjectModule = {
  name: sessionClockKey,
  implementation: 'real',
  install(scope) {
    new EntrySessionClock(scope, createSessionClock())
  },
}
