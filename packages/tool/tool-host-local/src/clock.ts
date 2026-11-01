// The host clock (G4): one monotonic reading per process plus a process epoch. A marker names the
// epoch it was made in and holds the monotonic start; `elapsed` is the monotonic distance from that
// start. A marker of another epoch (another process, a restart) is not compared: the clock answers
// a failure, never a number, so a recovery does not recount from zero and does not add budget.
// The wall time only answers `now` and the instants of `waitUntil`; nothing is measured with it.
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure } from '@omne-harness/tool-contract'
import type { ToolClock } from '@omne-harness/tool-contract/provider'

/** The owner named in every evidence the clock mints. */
export const LOCAL_TOOL_CLOCK_OWNER = '@omne-harness/tool-host-local/clock'

const SOURCE = 'tool-host-local/monotonic'
/** The longest delay a timer holds, in milliseconds. */
const LONGEST_TIMER_MS = 2_147_483_647

export type LocalToolClockInput = Readonly<{
  /** The wall time in milliseconds since the Unix epoch. Absent means `Date.now`. */
  wallMs?: () => number
  /**
   * A reading that never goes back, in milliseconds. Absent means the process high-resolution
   * timer. It must not be the wall time: the wall time can be turned back.
   */
  monotonicMs?: () => number
  /** The identity of this process run. Absent means a random one. No `/` in it. */
  epoch?: string
  /** Waits `milliseconds` or until `signal` aborts. Absent means a timer. */
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<'elapsed' | 'cancelled'>
}>

const processMonotonicMs = (): number => Number(process.hrtime.bigint() / 1_000_000n)

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

/**
 * Builds the host clock. The markers are non-durable: they are only comparable inside the process
 * run that made them, and a digest keyed by a secret of this run refuses a marker that was
 * changed or made elsewhere.
 */
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
      // A marker of another run is a marker of a clock that this one cannot be compared with.
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
