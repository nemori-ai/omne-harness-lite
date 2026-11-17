import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { cardIdOf, scheduleConsentRef } from '@omne-harness/schedule-tools'
import { readConsentAnswer } from '../../../src/rows/schedule/consent-answer.ts'
import type { DecidedCard } from '../../../src/rows/tool-hitl/bridge.ts'

const tenantOf = (account: string): TenantId => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const A = tenantOf('1')
const TENANT = (tenantCodec.encode(A) as { ok: true; value: string }).value
const CALL = 'call-1'
const DIGEST = 'd'.repeat(64)
const CARD = cardIdOf(DIGEST)
const choose = (optionId: string, cardId = CARD): DecidedCard => ({
  cardId,
  reply: { kind: 'selection', optionId } as DecidedCard['reply'],
})

function reader(cards: readonly DecidedCard[] | 'down' | null, live = true) {
  return readConsentAnswer({
    live: (tenantRef, call) =>
      live && call === CALL && tenantRef === TENANT
        ? { principal: 'p', tenant: A, call: CALL as never }
        : undefined,
    decidedCards: () =>
      cards === null
        ? null
        : async () =>
            cards === 'down'
              ? { failure: { kind: 'unavailable', dependency: 'x', diagnostic: 'down' } as never }
              : { ok: cards },
  })
}

describe('readConsentAnswer: the owner answer a consent reference names', () => {
  it.each([
    ['activate', true],
    ['approve', true],
    ['draft', false],
    ['none', false],
    ['reject', false],
  ])("reads the %s option of this call's own card with its digest", async (option, approved) => {
    expect(await reader([choose(option)])(TENANT, scheduleConsentRef(CALL, CARD), CALL)).toEqual({
      fromOwner: true,
      approved,
      digest: DIGEST,
    })
  })

  it.each([
    ['a reference to a card of another call', scheduleConsentRef('call-2', CARD)],
    ['a reference the tool never wrote', 'forged-decision'],
    ['a card of this call that is not a consent card', scheduleConsentRef(CALL, 'other-card')],
  ])('finds nothing for %s', async (_, decision) => {
    expect(
      await reader([choose('approve'), choose('approve', 'other-card')])(TENANT, decision, CALL),
    ).toBeNull()
  })

  it('reads nothing as consent for another tenant, and finds nothing yet for an undecided card', async () => {
    expect(
      await reader([choose('approve')])('tenant/other', scheduleConsentRef(CALL, CARD), CALL),
    ).toBeUndefined()
    expect(await reader([])(TENANT, scheduleConsentRef(CALL, CARD), CALL)).toBeNull()
  })

  it.each([
    ['the call is no longer open here', [choose('approve')], false],
    ['human intervention is not mounted', null, true],
    ['human intervention cannot read the card', 'down', true],
  ] as const)('cannot read the answer when %s', async (_, cards, live) => {
    expect(await reader(cards, live)(TENANT, scheduleConsentRef(CALL, CARD), CALL)).toBeUndefined()
  })
})

describe('the registry of open calls', () => {
  it('keeps the calls of two tenants apart even with the same call id', async () => {
    const { liveCallKey } = await import('../../../src/rows/tool-bindings/live-calls.ts')
    expect(liveCallKey('tenant/a', 'call-1')).not.toBe(liveCallKey('tenant/b', 'call-1'))
    expect(liveCallKey('tenant/a', 'call-1')).not.toBe(liveCallKey('tenant/a', 'call-2'))
    expect(liveCallKey('tenant/a', 'call-1')).toBe(liveCallKey('tenant/a', 'call-1'))
  })
})
