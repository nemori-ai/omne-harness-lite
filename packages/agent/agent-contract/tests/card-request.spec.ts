import { describe, expect, it } from 'vitest'
import {
  DECISION_CARD_DRAFT_SCHEMA,
  cardDraftOf,
  cardRequestOf,
  type DecisionCardDraft,
} from '@omne-harness/agent-contract'

const draft: DecisionCardDraft = {
  explanation: 'The agent wants to run `rm notes.txt`.',
  options: [
    {
      id: 'once',
      label: 'This time',
      effect: {
        kind: 'object',
        entries: [{ key: 'scope', value: { kind: 'string', value: 'once' } }],
      },
    },
    { id: 'no', label: 'No' },
  ],
  about: { position: 'before_action' },
  proposedRewrite: { option: 'once', effectiveArguments: '{"command":"rm -i notes.txt"}' },
}

describe('the request of one decision card', () => {
  it('carries the identity and the draft under the one named shape, and gives the draft back', () => {
    const request = cardRequestOf('action-1/admission/1/once', draft)
    expect(request.identity).toBe('action-1/admission/1/once')
    expect(request.schema).toEqual(DECISION_CARD_DRAFT_SCHEMA)
    expect(cardDraftOf(request)).toEqual(draft)
  })

  it('gives the same request value for the same draft', () => {
    expect(cardRequestOf('a', draft).value).toEqual(cardRequestOf('b', draft).value)
  })

  it('reads no draft from a request of another shape', () => {
    const request = cardRequestOf('a', draft)
    for (const schema of [
      { ...DECISION_CARD_DRAFT_SCHEMA, revision: '2' },
      { ...DECISION_CARD_DRAFT_SCHEMA, name: 'other' },
      { ...DECISION_CARD_DRAFT_SCHEMA, owner: 'other' },
      { ...DECISION_CARD_DRAFT_SCHEMA, digest: 'other' },
    ])
      expect(cardDraftOf({ ...request, schema })).toBeNull()
  })

  it('reads no draft from a value that is not a card draft', () => {
    const request = cardRequestOf('a', draft)
    expect(cardDraftOf({ ...request, value: { kind: 'string', value: 'draft' } })).toBeNull()
    const twice = { ...draft, options: [draft.options[0], draft.options[0]] } as DecisionCardDraft
    expect(cardDraftOf(cardRequestOf('a', twice))).toBeNull()
  })
})
