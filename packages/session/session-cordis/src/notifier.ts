import type { Context } from '@deepseek-ai/cordis'
import type { SessionNotifier } from '@omne-harness/session-contract'
import type {} from '@omne-harness/session-cordis-contract/cordis'
import { describe, diagnoser } from './diagnostics.ts'

const COMMITTED = 'session-cordis-contract/committed'

export function createSessionCommitNotifier(ctx: Context): SessionNotifier {
  const diagnose = diagnoser(ctx, 'session-notifier')
  return {
    committed: async notice => {
      try {
        ctx
          .parallel(
            COMMITTED,
            notice.tenant,
            notice.session,
            notice.revision,
            notice.source,
            notice.kinds,
          )
          .catch((error: unknown) => {
            diagnose(`a listener of ${COMMITTED} failed: ${describe(error)}`)
          })
      } catch (error) {
        diagnose(`dispatching ${COMMITTED} failed: ${describe(error)}`)
      }
      const relay = ctx.get('sessionNotifier')
      if (relay === undefined) return
      try {
        await relay.committed(notice)
      } catch (error) {
        diagnose(`sessionNotifier failed: ${describe(error)}`)
      }
    },
  }
}
