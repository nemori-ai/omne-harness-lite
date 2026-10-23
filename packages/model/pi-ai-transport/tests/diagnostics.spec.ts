import { describe, expect, it } from 'vitest'
import { createDiagnosticSink, type TransportDiagnostic } from '../src/diagnostics.ts'

const started: TransportDiagnostic = { kind: 'exchange-started', level: 'info' }
const failedConnect: TransportDiagnostic = { kind: 'connect-failed', level: 'error' }

async function settle(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

function deferred() {
  let resolve: () => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('isolating the diagnostic observer', () => {
  it('delivers a frozen copy that holds only the kind and the level', () => {
    const received: unknown[] = []
    const sink = createDiagnosticSink(event => received.push(event), { maxPending: 1 })
    const event: TransportDiagnostic = Object.assign(
      { kind: 'exchange-stopped', level: 'info' } satisfies TransportDiagnostic,
      { url: 'https://secret' },
    )

    sink.emit(event)
    expect(received).toEqual([{ kind: 'exchange-stopped', level: 'info' }])
    expect(received[0]).not.toBe(event)
    expect(Object.isFrozen(received[0])).toBe(true)
    expect(sink.counters()).toEqual({ failed: 0, pending: 0, dropped: 0 })
  })

  it('a synchronous throw is counted as failed and later events are still delivered', () => {
    const received: string[] = []
    const sink = createDiagnosticSink(
      event => {
        received.push(event.kind)
        if (event.kind === 'exchange-started') throw new Error('observer broke')
      },
      { maxPending: 1 },
    )

    expect(sink.emit(started)).toBeUndefined()
    sink.emit(failedConnect)
    expect(received).toEqual(['exchange-started', 'connect-failed'])
    expect(sink.counters()).toEqual({ failed: 1, pending: 0, dropped: 0 })
  })

  it('a returned thenable is pending until it settles; a rejection counts as failed', async () => {
    const accepted = deferred()
    const refused = deferred()
    const completions = [accepted.promise, refused.promise]
    const sink = createDiagnosticSink(() => completions.shift(), { maxPending: 4 })

    sink.emit(started)
    sink.emit(started)
    expect(sink.counters()).toEqual({ failed: 0, pending: 2, dropped: 0 })

    accepted.resolve()
    refused.reject(new Error('observer rejected'))
    await settle()
    expect(sink.counters()).toEqual({ failed: 1, pending: 0, dropped: 0 })
  })

  it('a thenable that never settles stays pending; at the bound events are dropped', async () => {
    let calls = 0
    const sink = createDiagnosticSink(
      () => {
        calls += 1
        return new Promise<void>(() => {})
      },
      { maxPending: 2 },
    )

    for (let index = 0; index < 5; index += 1) sink.emit(started)
    await settle()
    expect(calls).toBe(2)
    expect(sink.counters()).toEqual({ failed: 0, pending: 2, dropped: 3 })
  })

  it('delivery resumes once a pending completion settles below the bound', async () => {
    const first = deferred()
    let calls = 0
    const sink = createDiagnosticSink(
      () => {
        calls += 1
        return calls === 1 ? first.promise : undefined
      },
      { maxPending: 1 },
    )

    sink.emit(started)
    sink.emit(started)
    expect(sink.counters()).toEqual({ failed: 0, pending: 1, dropped: 1 })

    first.resolve()
    await settle()
    sink.emit(started)
    expect(calls).toBe(2)
    expect(sink.counters()).toEqual({ failed: 0, pending: 0, dropped: 1 })
  })

  it('a completion whose then accessor throws is counted as failed', () => {
    // Every property read throws, the `then` lookup included.
    const hostile = new Proxy(
      {},
      {
        has: () => true,
        get: () => {
          throw new Error('then accessor broke')
        },
      },
    )
    const sink = createDiagnosticSink(() => hostile, { maxPending: 1 })

    expect(() => sink.emit(started)).not.toThrow()
    expect(sink.counters()).toEqual({ failed: 1, pending: 0, dropped: 0 })
  })

  it('a plain return value is neither pending nor failed', () => {
    const sink = createDiagnosticSink(() => 42, { maxPending: 1 })
    sink.emit(started)
    expect(sink.counters()).toEqual({ failed: 0, pending: 0, dropped: 0 })
  })

  it('the counters are a frozen snapshot', () => {
    const sink = createDiagnosticSink(
      () => {
        throw new Error('observer broke')
      },
      { maxPending: 1 },
    )
    const before = sink.counters()
    sink.emit(started)
    expect(Object.isFrozen(before)).toBe(true)
    expect(before.failed).toBe(0)
    expect(sink.counters().failed).toBe(1)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects maxPending %s synchronously with a RangeError',
    maxPending => {
      expect(() => createDiagnosticSink(() => undefined, { maxPending })).toThrow(RangeError)
    },
  )
})
