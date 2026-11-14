import { describe, expect, it } from 'vitest'
import {
  ACTION_ADMISSION_DECLARATION,
  ACTION_ADMISSION_IMPLEMENTATION,
  admissionPassageOf,
  cardRequestOf,
  decodeActionId,
  type CardRequest,
  type CardRound,
  type Conclusion,
  type DecisionCardDraft,
  type DurableEvidence,
  type ExtensionOutput,
  type Passage,
} from '@omne-harness/agent-contract'
import { cardRequestIdentity, cardRound } from '../src/loop/identities.ts'
import {
  answeredRound,
  apply,
  failPresent,
  markPresented,
  mayPresent,
  needOf,
  openRound,
  recordReply,
  repeatsAnsweredRound,
  resolve,
} from '../src/loop/passages.ts'
import { ok } from './journal-support.ts'

const action = ok(decodeActionId('step-1/tool/0'))
const id = ok(admissionPassageOf(action))
const evidence = (record: string): DurableEvidence => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})
const draft = (explanation: string): DecisionCardDraft => ({
  explanation,
  options: [
    { id: 'once', label: 'Allow once' },
    { id: 'no', label: 'Do not allow' },
  ],
  about: { position: 'before_action', action },
})
const concluded = <O extends ExtensionOutput>(output: O): Conclusion & Readonly<{ output: O }> => ({
  position: 'before_action',
  action,
  passage: id,
  extension: ACTION_ADMISSION_DECLARATION.name,
  implementation: ACTION_ADMISSION_IMPLEMENTATION,
  power: ACTION_ADMISSION_DECLARATION.power,
  at: '2026-11-10T00:00:00Z',
  output,
})
const fresh: Passage = {
  id,
  position: 'before_action',
  dimension: null,
  purpose: null,
  action,
  ordinal: 0,
  declaration: ACTION_ADMISSION_DECLARATION,
  implementation: ACTION_ADMISSION_IMPLEMENTATION,
  input: evidence('input'),
  effective: evidence('effective'),
  operations: [],
  progress: { kind: 'requested', mode: { kind: 'fresh' } },
}
const requestsOf = (ordinal: number, ...explanations: string[]): CardRequest[] =>
  explanations.map((explanation, index) =>
    cardRequestOf(cardRequestIdentity(cardRound(id, ordinal), index + 1), draft(explanation)),
  )
const asking = (ordinal: number, passage: Passage, ...explanations: string[]): Passage =>
  ok(
    openRound(
      passage,
      cardRound(id, ordinal),
      concluded({ kind: 'ask', card: draft(explanations[0] ?? '') }),
      requestsOf(ordinal, ...explanations),
    ),
  )
const chosen = (card: string) => ({
  kind: 'chosen' as const,
  option: 'once',
  value: null,
  evidence: evidence(`${card}/answer`),
})
const lastOf = (passage: Passage): CardRound => {
  if (passage.progress.kind === 'requested') throw new Error('the passage has no round')
  return passage.progress.rounds.at(-1) as CardRound
}
const presented = (ordinal: number, passage: Passage, ...explanations: string[]): Passage =>
  ok(
    markPresented(
      asking(ordinal, passage, ...explanations),
      explanations.map((_, index) => evidence(`card-${ordinal}-${index}`)),
    ),
  )
const answered = (ordinal: number, passage: Passage): Passage =>
  ok(
    recordReply(presented(ordinal, passage, 'Run rm?'), evidence(`card-${ordinal}-0`), chosen('c')),
  )
const outside = (step: string, state: string) => ({ failure: { kind: 'outside', step, state } })

describe('a round is saved before its cards exist (constraint 1)', () => {
  it('refuses cards for a passage that saved no round', () => {
    expect(markPresented(fresh, [evidence('card')])).toEqual(outside('markPresented', 'requested'))
  })

  it('keeps one card for each request, in the order of the requests', () => {
    const passage = presented(1, fresh, 'Run rm?', 'Run curl?')
    expect(lastOf(passage)).toMatchObject({
      round: 'step-1/tool/0/admission/round/1',
      progress: {
        kind: 'presented',
        cards: [
          { identity: 'step-1/tool/0/admission/round/1/card/1', card: evidence('card-1-0') },
          { identity: 'step-1/tool/0/admission/round/1/card/2', card: evidence('card-1-1') },
        ],
      },
    })
    expect(markPresented(asking(1, fresh, 'Run rm?', 'Run curl?'), [evidence('one')])).toEqual(
      outside('markPresented', 'asked/requested'),
    )
  })
})

describe('progress only moves forward (constraints 2 and 12)', () => {
  it('opens no second round while the saved round waits for its cards or its answers', () => {
    const round = cardRound(id, 2)
    const ask = concluded({ kind: 'ask', card: draft('Again?') })
    expect(openRound(asking(1, fresh, 'Run rm?'), round, ask, requestsOf(2, 'Again?'))).toEqual(
      outside('openRound', 'asked/requested'),
    )
    expect(openRound(presented(1, fresh, 'Run rm?'), round, ask, requestsOf(2, 'Again?'))).toEqual(
      outside('openRound', 'asked/presented'),
    )
  })

  it('does not present a presented round again, and saves the reply of a card once', () => {
    const passage = presented(1, fresh, 'Run rm?', 'Run curl?')
    expect(markPresented(passage, [evidence('x'), evidence('y')])).toEqual(
      outside('markPresented', 'asked/presented'),
    )
    const replied = ok(recordReply(passage, evidence('card-1-0'), chosen('a')))
    expect(
      recordReply(replied, evidence('card-1-0'), { kind: 'declined', evidence: evidence('late') }),
    ).toEqual(outside('recordReply', 'asked/presented'))
    expect(recordReply(passage, evidence('another card'), chosen('a'))).toEqual(
      outside('recordReply', 'asked/presented'),
    )
  })

  it('opens a round once and never without a request', () => {
    const ask = concluded({ kind: 'ask', card: draft('Run rm?') })
    expect(openRound(fresh, cardRound(id, 1), ask, [])).toEqual(outside('openRound', 'requested'))
    expect(openRound(answered(1, fresh), cardRound(id, 1), ask, requestsOf(1, 'Other?'))).toEqual(
      outside('openRound', 'asked/answered'),
    )
  })
})

describe('a round is answered when every card has the answer of a person (constraints 5 and 9)', () => {
  it('waits for the second card after the first is answered', () => {
    const first = ok(
      recordReply(presented(1, fresh, 'Run rm?', 'Run curl?'), evidence('card-1-0'), chosen('a')),
    )
    expect(needOf(first)).toBe('read')
    expect(answeredRound(first)).toBeNull()
    const both = ok(
      recordReply(first, evidence('card-1-1'), {
        kind: 'remark',
        text: 'Only inside the project directory.',
        evidence: evidence('remark'),
      }),
    )
    expect(needOf(both)).toBe('judge')
    expect(answeredRound(both)?.progress.cards.map(card => card.response?.kind)).toEqual([
      'chosen',
      'remark',
    ])
  })

  it('saves an invalidated card as invalidated and gets no answer from it', () => {
    const passage = ok(
      recordReply(presented(1, fresh, 'Run rm?'), evidence('card-1-0'), {
        kind: 'invalidated',
        evidence: evidence('closed'),
      }),
    )
    expect(lastOf(passage).progress).toMatchObject({
      kind: 'presented',
      cards: [{ response: { kind: 'invalidated' } }],
    })
    expect(needOf(passage)).toBe('closed')
    expect(answeredRound(passage)).toBeNull()
  })
})

describe('the saved progress decides whether the judge is called again (constraints 6 and 7)', () => {
  it('calls the judge for a fresh passage and for a fully answered round, and for no other state', () => {
    expect(needOf(null)).toBe('judge')
    expect(needOf(fresh)).toBe('judge')
    expect(needOf(asking(1, fresh, 'Run rm?'))).toBe('present')
    expect(needOf(presented(1, fresh, 'Run rm?'))).toBe('read')
    expect(needOf(answered(1, fresh))).toBe('judge')
  })

  it('does not hand back a round twice', () => {
    const allow = concluded({ kind: 'observed' })
    const resolved = ok(resolve(answered(1, fresh), allow, evidence('allow')))
    expect(needOf(resolved)).toBe('settled')
    expect(resolve(resolved, allow, evidence('allow'))).toEqual(
      outside('resolve', 'resolved/processed'),
    )
    const again = asking(2, answered(1, fresh), 'And curl?')
    expect(needOf(again)).toBe('present')
    expect(answeredRound(again)).toBeNull()
  })

  it('marks every answered round processed with the conclusion', () => {
    const second = ok(
      recordReply(
        ok(markPresented(asking(2, answered(1, fresh), 'And curl?'), [evidence('card-2-0')])),
        evidence('card-2-0'),
        { kind: 'declined', evidence: evidence('declined') },
      ),
    )
    const resolved = ok(
      resolve(second, concluded({ kind: 'veto', reason: 'declined' }), evidence('deny')),
    )
    expect(resolved.progress).toMatchObject({
      kind: 'resolved',
      conclusion: { output: { kind: 'veto' } },
      rounds: [
        {
          progress: {
            kind: 'processed',
            conclusion: evidence('deny'),
            cards: [{ processed: evidence('deny') }],
          },
        },
        { progress: { kind: 'processed', conclusion: evidence('deny') } },
      ],
    })
  })

  it('resolves a fresh passage without a round, and refuses one whose cards are out', () => {
    expect(
      ok(resolve(fresh, concluded({ kind: 'observed' }), evidence('allow'))).progress,
    ).toMatchObject({
      kind: 'resolved',
      rounds: [],
    })
    expect(
      resolve(presented(1, fresh, 'Run rm?'), concluded({ kind: 'observed' }), evidence('x')),
    ).toEqual(outside('resolve', 'asked/presented'))
  })
})

describe('cards that were refused for certain end the passage', () => {
  it('records the failed round, processes the rounds answered before, and calls the judge no more', () => {
    const failed = ok(
      failPresent(
        asking(2, answered(1, fresh), 'And curl?'),
        evidence('conflict'),
        concluded({ kind: 'veto', reason: 'the cards were not presented' }),
        evidence('agent-conclusion'),
      ),
    )
    expect(failed.progress).toMatchObject({
      kind: 'resolved',
      rounds: [
        { progress: { kind: 'processed', conclusion: evidence('agent-conclusion') } },
        { progress: { kind: 'present-failed', failure: evidence('conflict') } },
      ],
    })
    expect(needOf(failed)).toBe('settled')
    expect(
      failPresent(
        presented(1, fresh, 'Run rm?'),
        evidence('x'),
        concluded({ kind: 'observed' }),
        evidence('y'),
      ),
    ).toEqual(outside('failPresent', 'asked/presented'))
  })
})

describe('the batch barrier before cards are presented (constraint 4)', () => {
  it('holds the cards while a chain still needs its judge', () => {
    expect(mayPresent(['present', needOf(answered(1, fresh))])).toBe(false)
    expect(mayPresent(['present', needOf(null)])).toBe(false)
    expect(mayPresent(['present', 'read', 'settled'])).toBe(true)
  })
})

describe('a judge that asks the answered question again', () => {
  it('is recognised by the requests, not by their identities', () => {
    const passage = answered(1, fresh)
    expect(repeatsAnsweredRound(passage, requestsOf(2, 'Run rm?'))).toBe(true)
    expect(repeatsAnsweredRound(passage, requestsOf(2, 'Run rm -rf?'))).toBe(false)
    expect(repeatsAnsweredRound(presented(1, fresh, 'Run rm?'), requestsOf(2, 'Run rm?'))).toBe(
      false,
    )
  })
})

describe('the conclusion is adopted once it exists', () => {
  it('applies a resolved passage and nothing else', () => {
    const resolved = ok(resolve(fresh, concluded({ kind: 'observed' }), evidence('allow')))
    expect(ok(apply(resolved, evidence('barrier'))).progress).toMatchObject({
      kind: 'applied',
      transition: evidence('barrier'),
    })
    expect(apply(asking(1, fresh, 'Run rm?'), evidence('barrier'))).toEqual(
      outside('apply', 'asked/requested'),
    )
  })
})
