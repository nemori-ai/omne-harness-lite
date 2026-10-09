/** The number of retained responsibility entries, not the number of threads or physical calls. */
export type SessionDriverCloseResult =
  { readonly closed: true } | { readonly pending: true; readonly held: number }

/** Trusted control of one driver. Withdrawal never cancels borrowed execution pools. */
export interface SessionDriverControl {
  readonly requestStop: () => void
  readonly close: () => Promise<SessionDriverCloseResult>
}

/** Explicit engineering bounds. None of these fields grants execution authority. */
export interface SessionDriverPolicy {
  readonly scanLimit: number
  readonly intervalMs: number
  readonly maxTasks: number
  readonly maxHeld: number
  readonly maxFailures: number
  readonly maxStepsPerPass: number
}

/** Trusted root construction. The signal stops startup/new work, never physical execution. */
export interface SessionDriverStartup {
  readonly start: (
    policy: SessionDriverPolicy,
    signal: AbortSignal,
  ) => Promise<SessionDriverControl>
}
