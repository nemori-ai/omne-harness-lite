import type { ScheduleDomainError, SchedulePreviewView } from '@omne-harness/schedule-contract'
import type { SchedulePredictionDependencies } from './types.ts'

export class PredictionFailure extends Error {
  readonly code: ScheduleDomainError['code']
  readonly details: ScheduleDomainError['details']
  readonly retryable: boolean
  constructor(
    code: ScheduleDomainError['code'],
    message: string,
    details: ScheduleDomainError['details'] = {},
    retryable = false,
  ) {
    super(message)
    this.code = code
    this.details = details
    this.retryable = retryable
  }
}
export class PredictionLimit extends Error {
  readonly reason: Exclude<SchedulePreviewView['reason'], null>
  constructor(reason: Exclude<SchedulePreviewView['reason'], null>) {
    super(reason)
    this.reason = reason
  }
}
export class PredictionBudget {
  private readonly deadline: number
  private calendarCalls = 0
  private explanations = 0
  candidates = 0
  readonly dependencies: SchedulePredictionDependencies
  constructor(dependencies: SchedulePredictionDependencies) {
    this.dependencies = dependencies
    this.deadline = dependencies.monotonicClock.now() + dependencies.limits.timeoutMs
  }
  remaining(): number {
    const remaining = Math.ceil(this.deadline - this.dependencies.monotonicClock.now())
    if (remaining <= 0) throw new PredictionLimit('deadline_exceeded')
    return Math.min(remaining, this.dependencies.limits.timeoutMs)
  }
  calendar(): void {
    this.remaining()
    if (++this.calendarCalls > this.dependencies.limits.maxCalendarCalls)
      throw new PredictionLimit('search_limit')
  }
  explain(count: number): void {
    this.remaining()
    if (this.explanations + count > this.dependencies.limits.maxExplanations)
      throw new PredictionLimit('explanation_limit')
    this.explanations += count
  }
  availableCandidates(): number {
    this.remaining()
    const remaining = this.dependencies.limits.maxCandidates - this.candidates
    if (remaining <= 0) throw new PredictionLimit('search_limit')
    return remaining
  }
  chargeCandidates(count: number): void {
    if (this.candidates + count > this.dependencies.limits.maxCandidates)
      throw new PredictionLimit('search_limit')
    this.candidates += count
  }
  async read<T>(read: () => Promise<T>): Promise<T> {
    const timeoutMs = this.remaining()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        Promise.resolve().then(read),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new PredictionLimit('deadline_exceeded')), timeoutMs)
        }),
      ])
      this.remaining()
      return result
    } finally {
      clearTimeout(timer)
    }
  }
}
export function domainError(error: unknown, requestId: string): ScheduleDomainError {
  if (error instanceof PredictionLimit)
    return {
      code: 'search_limit',
      message: error.message,
      requestId,
      retryable: true,
      details: { reason: error.reason },
    }
  if (error instanceof PredictionFailure)
    return {
      code: error.code,
      message: error.message,
      requestId,
      retryable: error.retryable,
      details: error.details,
    }
  return {
    code: 'provider_failure',
    message: 'Prediction dependency failed',
    requestId,
    retryable: true,
    details: {},
  }
}
