import type { Context } from '@deepseek-ai/cordis'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { ClockService } from '@omne-harness-lite/offer-expiry/cordis'

export class LeaseClockService extends ClockService {
  readonly now: Clock['now']
  declare readonly checkpoint?: NonNullable<Clock['checkpoint']>

  constructor(ctx: Context, clock: Clock) {
    super(ctx)
    this.now = clock.now.bind(clock)
    if (clock.checkpoint) this.checkpoint = clock.checkpoint.bind(clock)
  }
}
