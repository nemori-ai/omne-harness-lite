import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Adoption } from '@omne-harness/exchange-refs'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ClockSample, SessionClock } from '@omne-harness/session-contract'
import { SessionClockService, sessionClockKey } from '@omne-harness/session-cordis-contract/cordis'
import { parseInstant, type InstantFailure } from '@omne-harness/utc-instant'
import type { EntryObjectModule } from '../types.ts'

export type SystemInstant =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; failure: InstantFailure }>

export function readSystemInstant(): SystemInstant {
  const text = new Date(
    /* wall-clock: clock-source -- the sessionClock and agentClock entry objects are the clock the assembly provides (AA runtime objects, 时钟). */ Date.now(),
  ).toISOString()
  const parsed = parseInstant(text)
  return parsed.ok ? { ok: true, text } : { ok: false, failure: parsed.failure }
}

export function epochMillisOf(instantText: string): number {
  const direct = Date.parse(instantText)
  if (!Number.isNaN(direct)) return direct
  const beforeLeap = Date.parse(instantText.replace(/:60(?=[.Z])/u, ':59'))
  if (Number.isNaN(beforeLeap)) throw new TypeError('instant text is outside the host clock range')
  return beforeLeap + 1000
}

const MAX_DELAY_MS = 2_147_483_647

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

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const OWNER = 'harness-server'
const PROTOCOL_NAME = 'system-clock'
const REVISION = '1'

const PROTOCOL: Adoption = Object.freeze({
  owner: OWNER,
  name: PROTOCOL_NAME,
  revision: REVISION,
  digest: sha256(`${OWNER}/${PROTOCOL_NAME}/${REVISION}`),
})

export function createSessionClock(): SessionClock {
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
