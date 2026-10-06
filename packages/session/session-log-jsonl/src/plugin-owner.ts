import { SessionLogService } from '@omne-harness-lite/session-log/cordis'
import type { SessionLog } from '@omne-harness-lite/session-log'
import type { Context } from '@deepseek-ai/cordis'
import { openJsonlSessionLog } from './open.ts'
import type { SessionLogOptions } from './policy.ts'

/** Internal composition seam for real IO fault tests; the published plugin selects real IO. */
export async function applySessionLog(
  ctx: Context,
  config: SessionLogOptions,
  open = openJsonlSessionLog,
): Promise<void> {
  const owner = await open({
    ...config,
    diagnostic:
      config.diagnostic ??
      (event => {
        if (event.level === 'error') ctx.logger.error(event)
        else ctx.logger.warn(event)
      }),
  })
  try {
    ctx.effect(() => () => owner.close(), 'session-log-jsonl.close')
    new LogProvider(ctx, owner)
  } catch (error) {
    await owner.close()
    throw error
  }
}

class LogProvider extends SessionLogService {
  readonly append: SessionLog['append']
  readonly readByKey: SessionLog['readByKey']
  readonly readSince: SessionLog['readSince']
  constructor(ctx: Context, log: SessionLog) {
    super(ctx)
    this.append = (...args) => log.append(...args)
    this.readByKey = (...args) => log.readByKey(...args)
    this.readSince = (...args) => log.readSince(...args)
  }
}
