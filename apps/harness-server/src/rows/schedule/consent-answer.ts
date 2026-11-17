import { cardIdOf, scheduleConsentRef } from '@omne-harness/schedule-tools'
import type { ToolHitlBridge } from '../tool-hitl/bridge.ts'
import type { LiveCall } from '../tool-bindings/live-calls.ts'
import type { ConsentAnswer } from './authorizer.ts'

const PREFIX = cardIdOf('')

/** The owner's answer a consent reference names: a decided card this very call raised. HITL takes
 * replies only from the tenant's entry, so a decided card is the owner's answer. */
export function readConsentAnswer(ports: {
  live(tenantRef: string, call: string): LiveCall | undefined
  decidedCards(): ToolHitlBridge['decidedCards'] | null
}) {
  return async (
    tenantRef: string,
    decision: string,
    call: string,
  ): Promise<ConsentAnswer | null | undefined> => {
    const access = ports.live(tenantRef, call)
    const decidedCards = ports.decidedCards()
    if (access === undefined || decidedCards === null) return undefined
    const cards = await decidedCards(access)
    if ('failure' in cards) return undefined
    const card = cards.ok.find(
      item => item.cardId.startsWith(PREFIX) && scheduleConsentRef(call, item.cardId) === decision,
    )
    if (card === undefined) return null
    const { reply } = card
    return {
      fromOwner: true,
      approved:
        reply.kind === 'selection' &&
        (reply.optionId === 'activate' || reply.optionId === 'approve'),
      digest: card.cardId.slice(PREFIX.length),
    }
  }
}
