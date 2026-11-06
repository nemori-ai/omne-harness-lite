import { describe, expect, it } from 'vitest'
import { CardSchema, SubmitReplySchema, decideReply, invalidateCard } from '../src/index.ts'

const pending = () =>
  CardSchema.parse({
    kind: 'pending',
    ref: { request: { tenantRef: 'tenant-a', requestId: 'request-a' }, cardId: 'card-a' },
    revision: '0',
    question: {
      cardId: 'card-a',
      kind: 'question',
      title: '怎么继续？',
      description: '请选择或直接说明。',
      options: [{ id: 'next', label: '继续', description: '继续原工作。' }],
    },
  })
const submission = (reply: unknown = { kind: 'text', text: '  保留我的原话\n' }) =>
  SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: { tenantRef: 'tenant-a', actorRef: 'human-a', operationId: 'answer-a' },
    cardRef: pending().ref,
    expectedRevision: '0',
    reply,
  })

describe('human reply decisions', () => {
  it('accepts independent original text without selecting an option', () => {
    expect(decideReply({ card: pending(), command: submission(), wait: 'live' })).toMatchObject({
      kind: 'ready',
      expectedRevision: '0',
      nextRevision: '1',
      reply: { kind: 'text', text: '  保留我的原话\n' },
    })
  })
  it('rejects stale revisions and a selection outside the original question', () => {
    expect(
      decideReply({
        card: pending(),
        command: SubmitReplySchema.parse({ ...submission(), expectedRevision: '1' }),
        wait: 'live',
      }),
    ).toMatchObject({ kind: 'conflict' })
    expect(
      decideReply({
        card: pending(),
        command: submission({ kind: 'selection', optionId: 'invented' }),
        wait: 'live',
      }),
    ).toMatchObject({ kind: 'invalid-input' })
  })
  it('allows decline without interpreting it as permission or a selected refusal', () => {
    expect(
      decideReply({ card: pending(), command: submission({ kind: 'decline' }), wait: 'live' }),
    ).toMatchObject({ kind: 'ready', reply: { kind: 'decline' } })
  })
  it('does not decide when the original work is terminal or cannot be checked', () => {
    expect(decideReply({ card: pending(), command: submission(), wait: 'terminal' })).toMatchObject(
      { kind: 'invalidated' },
    )
    expect(
      decideReply({ card: pending(), command: submission(), wait: 'unavailable' }),
    ).toMatchObject({ kind: 'unavailable' })
  })
  it('rejects cross-tenant commands and other card identities', () => {
    const otherTenant = SubmitReplySchema.parse({
      ...submission(),
      operation: { ...submission().operation, tenantRef: 'tenant-b' },
    })
    expect(decideReply({ card: pending(), command: otherTenant, wait: 'live' })).toMatchObject({
      kind: 'denied',
    })
    const otherCard = SubmitReplySchema.parse({
      ...submission(),
      cardRef: { ...submission().cardRef, cardId: 'other' },
    })
    expect(decideReply({ card: pending(), command: otherCard, wait: 'live' })).toMatchObject({
      kind: 'conflict',
    })
  })
  it('preserves answered history when the original work later ends', () => {
    const card = CardSchema.parse({
      ...pending(),
      kind: 'decided',
      revision: '1',
      decision: {
        ref: { card: pending().ref, decisionId: 'decision-a', submission: submission().operation },
        reply: { kind: 'decline' },
        basisRef: 'basis-a',
        commitReceipt: 'receipt-a',
      },
      delivery: { kind: 'pending' },
    })
    expect(card.kind).toBe('decided')
    if (card.kind !== 'decided') throw new Error('Expected decided fixture')
    expect(invalidateCard({ card, reason: 'archived', terminalEvidenceRef: 'archive-a' })).toEqual(
      card,
    )
    expect(decideReply({ card, command: submission(), wait: 'terminal' })).toMatchObject({
      kind: 'already-decided',
      decision: card.decision,
    })
  })
  it('invalidates only pending cards, once, with an exact decimal revision', () => {
    const card = CardSchema.parse({ ...pending(), revision: '9007199254740993' })
    const invalid = invalidateCard({ card, reason: 'cancelled', terminalEvidenceRef: 'cancel-a' })
    expect(invalid).toMatchObject({
      kind: 'invalidated',
      revision: '9007199254740994',
      reason: 'cancelled',
    })
    expect(
      invalidateCard({ card: invalid, reason: 'archived', terminalEvidenceRef: 'archive-b' }),
    ).toEqual(invalid)
    expect(decideReply({ card: invalid, command: submission(), wait: 'live' })).toMatchObject({
      kind: 'invalidated',
    })
  })
})
