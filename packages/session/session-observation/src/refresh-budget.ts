import {
  INTERVAL_FLOOR,
  type ObservationDiagnostic,
  type ObservationRefreshPolicy,
} from './ports.ts'

const CEILING = 30

export class RefreshBudget {
  readonly #policy: ObservationRefreshPolicy
  #tier: number
  #attempts = 0
  #waited = 0

  constructor(
    policy: ObservationRefreshPolicy,
    diagnose: (diagnostic: ObservationDiagnostic) => void,
  ) {
    let interval = policy.interval
    if (!(interval >= INTERVAL_FLOOR)) {
      diagnose({
        code: 'observation.policy-clamped',
        detail: `interval ${String(interval)} ms is below the floor ${String(INTERVAL_FLOOR)} ms`,
      })
      interval = INTERVAL_FLOOR
    }
    this.#policy = { ...policy, interval }
    this.#tier = interval
  }

  delay(): number {
    return this.#tier
  }

  waited(milliseconds: number): void {
    this.#waited += milliseconds
  }

  tick(): void {
    this.#attempts += 1
    this.#tier = Math.min(this.#tier * this.#policy.backoff, this.#policy.interval * CEILING)
  }

  reset(): void {
    this.#attempts = 0
    this.#waited = 0
    this.#tier = this.#policy.interval
  }

  exhausted(): boolean {
    return this.#attempts >= this.#policy.maxAttempts || this.#waited >= this.#policy.deadline
  }
}
