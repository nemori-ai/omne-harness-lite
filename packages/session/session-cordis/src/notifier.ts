// The notifier of commit notices (SPEC「提交通知」). The session log has one writer, and its one
// landing in session-storage-sql tells each fresh batch to the notifiers registered on the
// database; the application registers this one there. It dispatches the batch as the event
// `session-cordis-contract/committed` on the given Context and hands the same batch to the
// `sessionNotifier` service when there is one. It keeps no state: no dedup, no cache, no retry.
// A notice only wakes; losing, repeating or merging one changes no fact (session-contract EC-11).
import type { Context } from '@deepseek-ai/cordis'
import type { SessionNotifier } from '@omne-harness/session-contract'
import type {} from '@omne-harness/session-cordis-contract/cordis'
import { describe, diagnoser } from './diagnostics.ts'

const COMMITTED = 'session-cordis-contract/committed'

/**
 * The notifier that dispatches on `ctx`. A listener is not waited for; a listener that fails, and
 * a `sessionNotifier` that fails, are recorded as diagnostics of `session-notifier` and never
 * thrown. The answer settles once `sessionNotifier`, when there is one, has answered.
 */
export function createSessionCommitNotifier(ctx: Context): SessionNotifier {
  const diagnose = diagnoser(ctx, 'session-notifier')
  return {
    committed: async notice => {
      try {
        // Not awaited: no listener holds up the commit that is told.
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
