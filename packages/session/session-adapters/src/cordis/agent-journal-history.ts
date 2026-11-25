import type { SessionAccessCheck } from '@omne-harness/session-contract'
import { fail } from '@omne-harness/operation-result'
import type { EnsureModelHistory } from './model-history-readiness.ts'

type HistoryInput<P> = Parameters<EnsureModelHistory<P>>[0]

/** Access is checked before a Session holder serialises its history preparation. */
export function createJournalHistoryReadiness<P, B>(
  ports: Readonly<{
    accessCheck: SessionAccessCheck<P>
    bookOf(tenant: HistoryInput<P>['tenant'], session: HistoryInput<P>['session']): B | null
    run(book: B, input: HistoryInput<P>): ReturnType<EnsureModelHistory<P>>
  }>,
): EnsureModelHistory<P> {
  return async input => {
    const allowed = await ports.accessCheck.check({
      access: input,
      operation: 'history.readModelView',
      target: { kind: 'session', session: input.session },
    })
    if (allowed.kind === 'denied') return fail({ kind: 'denied', action: 'read-model-history' })
    if (allowed.kind === 'unavailable')
      return fail({
        kind: 'unavailable',
        owner: 'session-log-journal',
        diagnostic: allowed.diagnostic,
      })
    const book = ports.bookOf(input.tenant, input.session)
    return book === null
      ? fail({ kind: 'denied', action: 'read-model-history' })
      : ports.run(book, input)
  }
}
