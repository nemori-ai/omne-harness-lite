import type { Context } from '@deepseek-ai/cordis'

export type Diagnose = (detail: string) => void

export function describe(error: unknown): string {
  if (error instanceof AggregateError)
    return `${error.message} [${error.errors.map(describe).join('; ')}]`
  return error instanceof Error ? error.message : String(error)
}

export function diagnoser(ctx: Context, name = 'session-provider'): Diagnose {
  const logger = ctx.logger(name)
  return detail => {
    try {
      logger.error(detail)
    } catch {}
  }
}
