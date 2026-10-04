import { Service, type Context } from '@deepseek-ai/cordis'
import type { Clock } from './time.ts'

/** @owner packages/core/offer-expiry */
export abstract class ClockService extends Service implements Clock {
  static readonly provide = 'clock'

  constructor(ctx: Context) {
    super(ctx, ClockService.provide)
  }

  abstract now: Clock['now']
}

export const CLOCK_SERVICE = ClockService.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    clock: ClockService
  }
}
