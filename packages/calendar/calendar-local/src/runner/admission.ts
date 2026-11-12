import type { CalendarCallContext, CalendarQueryResult } from '@omne-harness/calendar-contract'
import { drain } from './drain.ts'

export type CalendarProviderStop = Readonly<{
  kind: 'stopped'
  inFlight: 'settled' | 'retained'
  pendingCalls: number
  cleanup:
    | Readonly<{ kind: 'returned'; value: unknown }>
    | Readonly<{ kind: 'failed'; message: string }>
    | Readonly<{ kind: 'borrowed' }>
    | Readonly<{ kind: 'retained' }>
}>

export class CalendarAdmission {
  private active = true
  private readonly pending = new Set<Promise<unknown>>()
  private stopping: Promise<CalendarProviderStop> | undefined

  private readonly drainTimeoutMs: number

  constructor(drainTimeoutMs: number) {
    this.drainTimeoutMs = drainTimeoutMs
  }

  invoke<T>(
    context: CalendarCallContext,
    operation: () => Promise<CalendarQueryResult<T>>,
  ): Promise<CalendarQueryResult<T>> {
    if (!this.active)
      return Promise.resolve({
        kind: 'error',
        error: {
          code: 'provider_failure',
          message: 'Calendar provider admission stopped',
          retryable: true,
          requestId: context.requestId,
          details: {},
        },
      })
    const promise = Promise.resolve().then(operation)
    this.pending.add(promise)
    void promise.then(
      () => this.pending.delete(promise),
      () => this.pending.delete(promise),
    )
    return promise
  }

  close(release?: () => unknown): Promise<CalendarProviderStop> {
    if (this.stopping) return this.stopping
    this.active = false
    let cleanup: CalendarProviderStop['cleanup'] = release
      ? { kind: 'retained' }
      : { kind: 'borrowed' }
    let releaseSettled: Promise<void> = Promise.resolve()
    if (release) {
      try {
        releaseSettled = Promise.resolve(release()).then(
          value => {
            cleanup = { kind: 'returned', value }
          },
          error => {
            cleanup = { kind: 'failed', message: String(error) }
          },
        )
      } catch (error) {
        cleanup = { kind: 'failed', message: String(error) }
      }
    }
    this.stopping = (async () => {
      const inFlight = await drain(
        Promise.allSettled([...this.pending, releaseSettled]),
        this.drainTimeoutMs,
      )
      return { kind: 'stopped', inFlight, pendingCalls: this.pending.size, cleanup }
    })()
    return this.stopping
  }
}
