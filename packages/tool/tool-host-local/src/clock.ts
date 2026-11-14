import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure } from '@omne-harness/tool-contract'
import type { ToolClock } from '@omne-harness/tool-contract/provider'

export const LOCAL_TOOL_CLOCK_OWNER = '@omne-harness/tool-host-local/clock'

const SOURCE = 'tool-host-local/monotonic'
const LONGEST_TIMER_MS = 2_147_483_647

export type LocalToolClockInput = Readonly<{
  wallMs?: () => number
  monotonicMs?: () => number
  epoch?: string
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<'elapsed' | 'cancelled'>
}>

export const processMonotonicMs = (): number => Number(process.hrtime.bigint() / 1_000_000n)

function timerSleep(milliseconds: number, signal: AbortSignal): Promise<'elapsed' | 'cancelled'> {
  if (signal.aborted) return Promise.resolve('cancelled')
  return new Promise(resolve => {
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve('cancelled')
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve('elapsed')
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const unreadable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'clock', diagnostic })

export function createLocalToolClock(input: LocalToolClockInput = {}): ToolClock {
  const wallMs = input.wallMs ?? Date.now
  const monotonicMs = input.monotonicMs ?? processMonotonicMs
  const sleep = input.sleep ?? timerSleep
  const epoch = input.epoch ?? randomUUID()
  if (epoch.length === 0 || epoch.includes('/'))
    throw new TypeError('input.epoch: must be non-empty text without "/"')
  const secret = randomBytes(32)
  let minted = 0

  const seal = (record: string): DurableEvidence =>
    Object.freeze({
      owner: LOCAL_TOOL_CLOCK_OWNER,
      record,
      revision: '1',
      digest: `hmac-sha256:${createHmac('sha256', secret).update(record).digest('hex')}`,
    })
  const sealed = (evidence: DurableEvidence): boolean =>
    evidence.owner === LOCAL_TOOL_CLOCK_OWNER &&
    evidence.revision === '1' &&
    seal(evidence.record).digest === evidence.digest

  return Object.freeze({
    now: () => new Date(wallMs()).toISOString(),
    begin: ({ operation }) => {
      minted += 1
      const marker = seal(`clock/${epoch}/${monotonicMs()}/${minted}/${operation}`)
      return Promise.resolve(succeed({ operation, source: SOURCE, epoch, marker }))
    },
    elapsed: evidence => {
      const [prefix, markerEpoch, start, , ...operation] = evidence.record.split('/')
      if (prefix !== 'clock' || operation.length === 0)
        return Promise.resolve(unreadable('the evidence is not a marker of this clock'))
      if (markerEpoch !== epoch)
        return Promise.resolve(unreadable('the epoch of the marker cannot be compared'))
      if (!sealed(evidence))
        return Promise.resolve(unreadable('the evidence is not a marker of this clock'))
      const milliseconds = Math.floor(monotonicMs() - Number(start))
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
        return Promise.resolve(unreadable('the monotonic reading is not usable'))
      minted += 1
      return Promise.resolve(
        succeed({
          milliseconds: String(milliseconds),
          evidence: seal(`clock/elapsed/${epoch}/${minted}/${milliseconds}/${evidence.digest}`),
        }),
      )
    },
    waitUntil: async (instant, signal) => {
      const target = Date.parse(instant)
      if (Number.isNaN(target)) throw new TypeError('instant: not a legal instant')
      for (;;) {
        if (signal.aborted) return 'cancelled'
        const remaining = target - wallMs()
        if (remaining <= 0) return 'elapsed'
        if ((await sleep(Math.min(Math.ceil(remaining), LONGEST_TIMER_MS), signal)) === 'cancelled')
          return 'cancelled'
      }
    },
  } satisfies ToolClock)
}
