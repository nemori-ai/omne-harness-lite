import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelReminderFailure } from './model-reminders.ts'
import type { ModelViewBasis, SessionAccess, SessionHistory } from '@omne-harness/session-contract'
import { emptyGuidanceIndex, extendGuidanceIndex, type GuidanceIndex } from './guidance-window.ts'

export type GuidanceHistory = Readonly<{
  basis: ModelViewBasis
  resume: string | null
  index: GuidanceIndex
}>

/** Every read requalifies. Only a verified prefix of the same effective epoch can satisfy a source. */
export async function readGuidanceHistory<P>(
  history: Pick<SessionHistory<P>, 'readModelView'>,
  access: SessionAccess<P>,
  partition: string,
  previous?: GuidanceHistory,
): Promise<Outcome<GuidanceHistory, ModelReminderFailure>> {
  let cached = previous?.resume == null ? undefined : previous
  let index = cached?.index ?? emptyGuidanceIndex()
  let after = cached?.resume ?? null
  let basis: ModelViewBasis | null = null
  for (;;) {
    const page = await history.readModelView({
      ...access,
      basis,
      after,
      resumeAtEnd: true,
      pageBytes: 1_048_576,
    })
    if (
      cached &&
      ('failure' in page
        ? page.failure.kind === 'invalid'
        : page.ok.kind !== 'page' || page.ok.basis.epoch !== cached.basis.epoch)
    ) {
      cached = undefined
      after = null
      basis = null
      index = emptyGuidanceIndex()
      continue
    }
    if ('failure' in page) {
      if (page.failure.kind === 'denied') return fail({ kind: 'denied' })
      return fail({
        kind: 'unavailable',
        diagnostic: 'Session model view: ' + JSON.stringify(page.failure),
      })
    }
    if (page.ok.kind !== 'page')
      return fail({
        kind: 'unavailable',
        diagnostic: 'the Session model view changed during preparation',
      })
    index = extendGuidanceIndex(
      index,
      page.ok.rows.map(row => row.message),
      partition,
    )
    if (page.ok.next === null)
      return succeed({ index, basis: page.ok.basis, resume: page.ok.resume ?? null })
    basis = page.ok.basis
    after = page.ok.next
  }
}
