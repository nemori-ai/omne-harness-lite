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
    ctx.provide(
      'sessionLog',
      Object.freeze({
        append: owner.append,
        readByKey: owner.readByKey,
        readSince: owner.readSince,
      }),
    )
  } catch (error) {
    await owner.close()
    throw error
  }
}
