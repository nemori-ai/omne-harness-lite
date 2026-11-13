// Diagnostics of the plugin. A fault that must not change an answer (a failing listener, a
// notifier that threw, a timed-out removal) is recorded here and never thrown. It goes to the
// Cordis logger of the plugin; a diagnostic is not a durable audit record.
import type { Context } from '@deepseek-ai/cordis'

export type Diagnose = (detail: string) => void

export function describe(error: unknown): string {
  if (error instanceof AggregateError)
    return `${error.message} [${error.errors.map(describe).join('; ')}]`
  return error instanceof Error ? error.message : String(error)
}

/** Records through the logger `name` of the Context the caller captured. */
export function diagnoser(ctx: Context, name = 'session-provider'): Diagnose {
  const logger = ctx.logger(name)
  return detail => {
    try {
      logger.error(detail)
    } catch {
      // A logger that fails must not turn a recorded fault into a thrown one.
    }
  }
}
