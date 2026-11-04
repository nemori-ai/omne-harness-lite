// The retry of a send that failed before its request bytes left, over injected exchanges: no
// socket and no network. The real sockets are in transport-retry.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnectionCapacity, type ConnectionReservation } from '../src/capacity.ts'
import type { TransportDiagnostic } from '../src/diagnostics.ts'
import type { ExchangeResult, ExchangeStart, HttpExchange } from '../src/http.ts'
import { retryBeforeRequestSent } from '../src/retry.ts'

const TIMEOUT: ExchangeResult = { kind: 'connect-failed', timeout: true }
const REFUSED: ExchangeResult = { kind: 'connect-failed', timeout: false }
const OK: ExchangeResult = {
  kind: 'ok',
  status: 200,
  headers: {},
  body: { claim: () => undefined, received: () => true },
}
const STOPPED: ExchangeResult = { kind: 'stopped', responded: false }

type FakeExchange = HttpExchange &
  Readonly<{ settle: (result: ExchangeResult) => void; stops: () => number }>

/** An exchange that settles when the test says so, as the real one settles after its physical end. */
function fake(requestMaySent: boolean, onClosed: () => void = () => undefined): FakeExchange {
  let settle: (result: ExchangeResult) => void = () => undefined
  const result = new Promise<ExchangeResult>(resolve => {
    settle = resolve
  })
  let stops = 0
  return {
    result,
    stop: () => {
      stops += 1
      settle(STOPPED)
    },
    stopped: result.then(onClosed),
    requestMaySent: () => requestMaySent,
    settle,
    stops: () => stops,
  }
}

/** A retrying exchange over fake attempts that hold real capacity slots, as the real ones do. */
async function scene(backoffMs: readonly number[], options: { firstMaySend?: boolean } = {}) {
  const capacity = createConnectionCapacity(1)
  const events: TransportDiagnostic[] = []
  const controller = new AbortController()
  const attempts: FakeExchange[] = []
  const attempt = (reservation: ConnectionReservation, maySend: boolean): FakeExchange => {
    const seat = reservation.consume()
    if (!('ok' in seat)) throw new Error('reservation not held')
    const exchange = fake(maySend, () => seat.ok.release())
    attempts.push(exchange)
    return exchange
  }
  const reservation = await capacity.reserve(controller.signal)
  if (reservation === undefined) throw new Error('no reservation')
  const first = attempt(reservation, options.firstMaySend ?? false)
  const exchange = retryBeforeRequestSent({
    capacity,
    diagnostics: { emit: event => events.push(event) },
    closed: () => false,
    first,
    startAgain: (next, signal): ExchangeStart => {
      expect(signal).toBe(controller.signal)
      return { kind: 'started', exchange: attempt(next, false) }
    },
    backoffMs,
    signal: controller.signal,
  })
  return { capacity, events, controller, attempts, exchange }
}

async function slotFree(capacity: Awaited<ReturnType<typeof scene>>['capacity']): Promise<boolean> {
  const controller = new AbortController()
  const pending = capacity.reserve(controller.signal)
  controller.abort()
  const reservation = await pending
  reservation?.release()
  return reservation !== undefined
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('retry before the request bytes left', () => {
  it('retries a connect failure after each backoff and settles with the attempt that got through', async () => {
    const { attempts, events, exchange } = await scene([500, 1000])
    attempts[0]?.settle(TIMEOUT)
    await vi.advanceTimersByTimeAsync(499)
    expect(attempts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(attempts).toHaveLength(2)
    attempts[1]?.settle(REFUSED)
    await vi.advanceTimersByTimeAsync(999)
    expect(attempts).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(attempts).toHaveLength(3)
    attempts[2]?.settle(OK)
    expect(await exchange.result).toBe(OK)
    expect(events).toEqual([
      { kind: 'connect-retry', level: 'info', attempt: 1, delayMs: 500, reason: 'connect-timeout' },
      { kind: 'connect-retry', level: 'info', attempt: 2, delayMs: 1000, reason: 'connect-failed' },
    ])
  })

  it('after the last allowed retry fails, settles with that attempt as it is', async () => {
    const { attempts, events, exchange, capacity } = await scene([500, 1000])
    attempts[0]?.settle(TIMEOUT)
    await vi.advanceTimersByTimeAsync(500)
    attempts[1]?.settle(TIMEOUT)
    await vi.advanceTimersByTimeAsync(1000)
    attempts[2]?.settle(REFUSED)
    expect(await exchange.result).toEqual(REFUSED)
    expect(attempts).toHaveLength(3)
    expect(events.map(event => event.kind)).toEqual(['connect-retry', 'connect-retry'])
    await exchange.stopped
    expect(await slotFree(capacity)).toBe(true)
  })

  it('never retries a failure after the request may have been written', async () => {
    const { attempts, events, exchange } = await scene([500, 1000], { firstMaySend: true })
    attempts[0]?.settle(REFUSED)
    expect(await exchange.result).toEqual(REFUSED)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(attempts).toHaveLength(1)
    expect(events).toEqual([])
  })

  it.each<[string, ExchangeResult]>([
    ['a 2xx response', OK],
    [
      'an HTTP error',
      {
        kind: 'http-error',
        status: 503,
        headers: {},
        errorBody: { kind: 'complete', bytes: new Uint8Array() },
      },
    ],
    ['a stall', { kind: 'stalled' }],
    ['a stop', STOPPED],
  ])('does not retry %s', async (_name, result) => {
    const { attempts, exchange } = await scene([500])
    attempts[0]?.settle(result)
    expect(await exchange.result).toBe(result)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(attempts).toHaveLength(1)
  })

  it('with an empty backoff list retries nothing', async () => {
    const { attempts, exchange } = await scene([])
    attempts[0]?.settle(TIMEOUT)
    expect(await exchange.result).toEqual(TIMEOUT)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(attempts).toHaveLength(1)
  })

  it('returns the slot before the wait, so the backoff does not hold a slot', async () => {
    const { attempts, capacity, exchange } = await scene([500])
    attempts[0]?.settle(TIMEOUT)
    await vi.advanceTimersByTimeAsync(100)
    expect(await slotFree(capacity)).toBe(true)
    exchange.stop()
    await exchange.stopped
  })
})

describe('stop during a retry', () => {
  it('stop() ends the backoff at once without a retry and settles stopped', async () => {
    const { attempts, capacity, exchange } = await scene([60_000])
    attempts[0]?.settle(TIMEOUT)
    await vi.advanceTimersByTimeAsync(10)
    exchange.stop()
    expect(await exchange.result).toEqual(STOPPED)
    await exchange.stopped
    expect(attempts).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(await slotFree(capacity)).toBe(true)
  })

  it('the cancel signal ends the backoff at once', async () => {
    const { attempts, controller, exchange } = await scene([60_000])
    attempts[0]?.settle(REFUSED)
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    expect(await exchange.result).toEqual(STOPPED)
    await exchange.stopped
    expect(attempts).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stop() while the retry waits for a slot starts nothing and keeps no slot', async () => {
    const { attempts, capacity, exchange } = await scene([100])
    attempts[0]?.settle(TIMEOUT)
    await vi.advanceTimersByTimeAsync(1)
    // Another sender takes the only slot during the backoff.
    const other = await capacity.reserve(new AbortController().signal)
    await vi.advanceTimersByTimeAsync(200)
    expect(attempts).toHaveLength(1)
    exchange.stop()
    expect(await exchange.result).toEqual(STOPPED)
    await exchange.stopped
    other?.release()
    expect(await slotFree(capacity)).toBe(true)
  })

  it('stop() reaches the running retry attempt', async () => {
    const { attempts, exchange } = await scene([100])
    attempts[0]?.settle(TIMEOUT)
    await vi.advanceTimersByTimeAsync(100)
    expect(attempts).toHaveLength(2)
    exchange.stop()
    expect(attempts[1]?.stops()).toBe(1)
    expect(await exchange.result).toEqual(STOPPED)
    await exchange.stopped
  })
})
