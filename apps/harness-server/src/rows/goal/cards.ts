import type { Context } from '@deepseek-ai/cordis'
import type { GoalCards } from '@omne-harness/goal'
import { readConfirmOption, type AnsweredCard } from '@omne-harness/goal-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import { hitlEntryRef } from '../../entry/hitl-entry-principals.ts'
import { toolHitlHolder } from '../tool-hitl/holder.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
const NONE = { kind: 'read', value: null } as const
/** The one card a proposal puts up. */
const CARD_ID = 'goal'
const NO_BASE = { generation: 0, revision: 0, live: false } as const

/** The card of a proposal as human intervention keeps it decided, read as the session whose call put it up.
 * Human intervention admits only a member of the tenant at each answer, and records the entry they came by, not who. */
export function createGoalCards(ctx: Context): GoalCards {
  return {
    async answered(tenantText, session, card) {
      const tenant = tenantCodec.parse(tenantText)
      if (!tenant.ok) return NONE
      const decided = toolHitlHolder(ctx).decidedCards
      const issued = await toolRuntimeHolder(ctx)
        .workPrincipals()
        ?.forSession({ actor: 'coordinator', tenant: tenant.value, session: session as SessionId })
      if (decided === null || issued === undefined) return UNAVAILABLE
      if (!('ok' in issued)) return issued.failure.kind === 'denied' ? NONE : UNAVAILABLE
      const access = { principal: issued.ok, tenant: tenant.value, call: card }
      const cards = await decided(access as Parameters<typeof decided>[0])
      if ('failure' in cards) return UNAVAILABLE
      const reply = cards.ok.find(found => found.cardId === CARD_ID)?.reply
      if (reply === undefined) return NONE
      const read = reply.kind === 'selection' ? readConfirmOption(reply.optionId) : null
      const answered: AnsweredCard = {
        card,
        by: hitlEntryRef(tenant.value),
        byMember: true,
        confirmed: read !== null,
        digest: read?.digest ?? '',
        base: read?.base ?? NO_BASE,
      }
      return { kind: 'read', value: answered }
    },
  }
}
