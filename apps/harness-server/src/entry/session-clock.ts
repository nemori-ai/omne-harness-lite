import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Adoption } from '@omne-harness/exchange-refs'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ClockSample, SessionClock } from '@omne-harness/session-contract'
import { SessionClockService, sessionClockKey } from '@omne-harness/session-cordis-contract/cordis'
import { waitUntil as waitUntilEpoch } from '@omne-harness/time-source'
import { parseInstant } from '@omne-harness/utc-instant'
import type { EntryObjectModule, EntryTime } from '../types.ts'
import { readInstant, timeOf } from './time.ts'

export function epochMillisOf(instantText: string): number {
  const direct = Date.parse(instantText)
  if (!Number.isNaN(direct)) return direct
  const beforeLeap = Date.parse(instantText.replace(/:60(?=[.Z])/u, ':59'))
  if (Number.isNaN(beforeLeap)) throw new TypeError('instant text is outside the host clock range')
  return beforeLeap + 1000
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const OWNER = 'harness-server'
const REVISION = '1'

export function createSessionClock(time: EntryTime): SessionClock {
  const protocol: Adoption = Object.freeze({
    owner: OWNER,
    name: time.protocol,
    revision: REVISION,
    digest: sha256(`${OWNER}/${time.protocol}/${REVISION}`),
  })
  let ordinal = 0
  const sample: SessionClock['sample'] = () => {
    const reading = readInstant(time.source)
    if (!reading.ok)
      return Promise.resolve(
        fail({
          kind: 'unavailable',
          owner: 'clock',
          diagnostic: `${time.protocol}:${reading.failure.kind}`,
        }),
      )
    ordinal += 1
    const record = `${time.protocol}/sample/${ordinal}`
    const value: ClockSample = Object.freeze({
      at: reading.text,
      protocol,
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
    return waitUntilEpoch(time.source, epochMillisOf(instant), signal)
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
  install(scope, env) {
    new EntrySessionClock(scope, createSessionClock(timeOf(env)))
  },
}
