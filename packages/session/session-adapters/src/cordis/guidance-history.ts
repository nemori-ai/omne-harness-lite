import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ModelReminderFailure } from './model-reminders.ts'
import type { Message } from '@omne-harness/message'
import type { ModelViewBasis, SessionHistory, SessionId } from '@omne-harness/session-contract'
import type { TenantId } from '@omne-harness/legal-identity'

export type GuidanceHistory = Readonly<{ messages: readonly Message[]; basis: ModelViewBasis }>

/** Read the same bounded epoch the Session exposes to Request Context. */
export async function readGuidanceHistory<P>(
  history: SessionHistory<P>,
  access: { principal: P; tenant: TenantId; session: SessionId },
): Promise<Outcome<GuidanceHistory, ModelReminderFailure>> {
  const reminders: Message[] = []
  let basis: ModelViewBasis | null = null
  let after: string | null = null
  for (;;) {
    const page = await history.readModelView({ ...access, basis, after, pageBytes: 1_048_576 })
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
    for (const { message } of page.ok.rows)
      if (message.role === 'system_reminder') reminders.push(message)
    if (page.ok.next === null) return succeed({ messages: reminders, basis: page.ok.basis })
    basis = page.ok.basis
    after = page.ok.next
  }
}
