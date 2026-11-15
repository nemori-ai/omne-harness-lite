import type { ScheduleDomainError } from '@omne-harness/schedule-contract'

export class ScheduleLocalLifetime {
  private readonly pending = new Set<Promise<unknown>>()
  private stopping = false
  private closing: Promise<void> | undefined

  run<T>(operation: () => Promise<T>, refused: () => T): Promise<T> {
    if (this.stopping) return Promise.resolve(refused())
    const pending = Promise.resolve().then(operation)
    this.pending.add(pending)
    void pending.then(
      () => this.pending.delete(pending),
      () => this.pending.delete(pending),
    )
    return pending
  }

  close(dispose: () => Promise<void>): Promise<void> {
    if (this.closing) return this.closing
    this.stopping = true
    this.closing = Promise.allSettled(this.pending).then(dispose)
    return this.closing
  }
}

export function stoppedError(): ScheduleDomainError {
  return {
    code: 'dependency_blocked',
    message: 'The local schedule application is stopping',
    retryable: true,
    requestId: 'schedule.local.closed',
    details: {},
  }
}
