import { afterEach, expect, it, vi } from 'vitest'
import { CalendarAdmission } from '../../src/runner/admission.ts'
import { context } from './fixture.ts'

afterEach(() => vi.useRealTimers())

it.each(['fulfilled', 'rejected'] as const)(
  'removes a %s call before reporting pending work',
  async outcome => {
    const gate = new CalendarAdmission(10)
    const failure = new Error('original operation failed')
    const operation = vi.fn(async () => {
      if (outcome === 'rejected') throw failure
      return { kind: 'ok', value: 'original result' } as const
    })
    const call = gate.invoke(context, operation)
    if (outcome === 'rejected') await expect(call).rejects.toBe(failure)
    else expect(await call).toEqual({ kind: 'ok', value: 'original result' })
    const stopped = gate.close()
    expect(gate.close()).toBe(stopped)
    expect(await stopped).toEqual({
      kind: 'stopped',
      inFlight: 'settled',
      pendingCalls: 0,
      cleanup: { kind: 'borrowed' },
    })
    expect(await gate.invoke({ ...context, requestId: 'after-stop' }, operation)).toEqual({
      kind: 'error',
      error: {
        code: 'provider_failure',
        message: 'Calendar provider admission stopped',
        retryable: true,
        requestId: 'after-stop',
        details: {},
      },
    })
    expect(operation).toHaveBeenCalledOnce()
  },
)

it.each(['throw', 'reject'] as const)(
  'retains a %s from owned cleanup in the single close report',
  async outcome => {
    const gate = new CalendarAdmission(10)
    const release = vi.fn(() => {
      if (outcome === 'throw') throw new Error('cleanup failed')
      return Promise.reject(new Error('cleanup failed'))
    })
    const closed = gate.close(release)
    expect(gate.close(release)).toBe(closed)
    expect(await closed).toEqual({
      kind: 'stopped',
      inFlight: 'settled',
      pendingCalls: 0,
      cleanup: { kind: 'failed', message: 'Error: cleanup failed' },
    })
    expect(release).toHaveBeenCalledOnce()
  },
)

it('reports returned cleanup values and preserves a deadline report after late cleanup settles', async () => {
  vi.useFakeTimers()
  const returned = new CalendarAdmission(10)
  expect(await returned.close(async () => ({ durableRuns: 'retained' }))).toEqual({
    kind: 'stopped',
    inFlight: 'settled',
    pendingCalls: 0,
    cleanup: { kind: 'returned', value: { durableRuns: 'retained' } },
  })
  const gate = new CalendarAdmission(10)
  const pending = Promise.withResolvers<void>()
  const stopped = gate.close(() => pending.promise)
  const observe = vi.fn()
  void stopped.then(observe)
  await vi.advanceTimersByTimeAsync(9)
  expect(observe).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  const report = await stopped
  expect(report).toEqual({
    kind: 'stopped',
    inFlight: 'retained',
    pendingCalls: 0,
    cleanup: { kind: 'retained' },
  })
  pending.resolve()
  await Promise.resolve()
  expect(await gate.close()).toBe(report)
  expect(report.cleanup).toEqual({ kind: 'retained' })
  expect(vi.getTimerCount()).toBe(0)
})
