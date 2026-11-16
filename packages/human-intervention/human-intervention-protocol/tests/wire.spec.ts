import { describe, expect, it } from 'vitest'
import { humanInterventionProtocol } from '@omne-harness/human-intervention-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const operations = humanInterventionProtocol.operations
type Name = keyof typeof operations

const cardRef = { request: { tenantRef: tenant, requestId: 'request-1' }, cardId: 'card-1' }
const pick = { kind: 'selection', optionId: 'yes' }
const text = { kind: 'text', text: 'not now' }
const decline = { kind: 'decline' }
const submission = {
  tenant,
  card: cardRef,
  expectedRevision: '0',
  reply: pick,
  replyId: 'reply-1',
}
const question = {
  cardId: 'card-1',
  title: 'Delete the files?',
  description: 'The tool deletes 3 files',
  declineConsequence: 'The tool does not run',
}
const approval = {
  ...question,
  kind: 'approval',
  options: [{ id: 'yes', label: 'Yes', description: 'Delete', effectRef: 'effect-1' }],
}
const asking = {
  ...question,
  kind: 'question',
  options: [{ id: 'a', label: 'A', description: 'The first' }],
}
const submissionRef = { tenantRef: tenant, actorRef: 'actor-1', operationId: 'operation-1' }
const decisionRef = { card: cardRef, decisionId: 'decision-1', submission: submissionRef }
const decision = { ref: decisionRef, reply: pick, basisRef: 'basis-1', commitReceipt: 'receipt-1' }
const head = { ref: cardRef, revision: '3' }
const origin = { kind: 'tool', sessionRef: session, runRef: 'run-1', toolCallRef: 'call-1' }
const item = (card: object, own: object = origin) => ({
  card,
  origin: own,
  displayContext: 'a tool call in a session',
})
const pending = { ...head, question: approval, kind: 'pending' }
const decided = {
  ...head,
  question: asking,
  kind: 'decided',
  decision,
  delivery: { kind: 'accepted', receiptRef: 'receipt-2' },
}
const invalidated = {
  ...head,
  question: approval,
  kind: 'invalidated',
  reason: 'origin-terminal',
  terminalEvidenceRef: 'evidence-1',
}

const replyResults = [
  { kind: 'decided', decisionRef, revision: '4', delivery: 'pending' },
  { kind: 'decided', decisionRef, revision: '4', delivery: 'accepted' },
  { kind: 'already-decided', decision },
  { kind: 'invalidated', reason: 'cancelled' },
]

const validBodies: Readonly<Record<Name, readonly object[]>> = {
  'list-cards': [
    { tenant, filter: { states: ['pending'] }, cursor: null, limit: 20 },
    {
      tenant,
      filter: {
        states: ['pending', 'decided', 'invalidated'],
        originKind: 'admission',
        sessionRef: session,
        delivery: 'superseded',
      },
      cursor: 'page-2',
      limit: 5,
    },
  ],
  'read-card': [{ tenant, card: cardRef }],
  'submit-reply': [submission, { ...submission, reply: text }, { ...submission, reply: decline }],
  'query-submit-reply': [submission],
}

const invalidBodies: Readonly<Record<Name, readonly object[]>> = {
  'list-cards': [
    { tenant, filter: { states: [] }, cursor: null, limit: 20 },
    {
      tenant,
      filter: { states: ['pending', 'pending', 'decided', 'invalidated'] },
      cursor: null,
      limit: 20,
    },
    { tenant, filter: { states: ['open'] }, cursor: null, limit: 20 },
    { tenant, filter: { states: ['pending'] }, cursor: null, limit: 0 },
    { tenant, filter: { states: ['pending'] }, limit: 20 },
    { tenant, filter: { states: ['pending'], sessionRef: 'short' }, cursor: null, limit: 20 },
    { tenant, filter: { states: ['pending'] }, cursor: null, limit: 20, locationRef: 'other' },
    { tenant: 'not-a-tenant', filter: { states: ['pending'] }, cursor: null, limit: 20 },
  ],
  'read-card': [
    { tenant, card: { ...cardRef, cardId: 7 } },
    { tenant, card: cardRef, extra: 1 },
  ],
  'submit-reply': [
    { ...submission, expectedRevision: '01' },
    { ...submission, expectedRevision: 'x' },
    { ...submission, reply: { kind: 'selection' } },
    { ...submission, reply: { kind: 'shrug' } },
    { ...submission, operationId: 'forged' },
    { tenant, card: cardRef, expectedRevision: '0', reply: pick },
  ],
  'query-submit-reply': [{ ...submission, replyId: undefined }],
}

const successBodies: Readonly<Record<Name, readonly object[]>> = {
  'list-cards': [
    { items: [], next: null, snapshotRef: 'snapshot-1', completeness: 'complete' },
    {
      items: [
        item(pending),
        item(decided, { kind: 'independent' }),
        item(invalidated, { kind: 'agent-extension', sessionRef: session }),
      ],
      next: 'cursor-2',
      snapshotRef: 'snapshot-2',
      completeness: 'partial',
    },
  ],
  'read-card': [{ item: item(pending) }, { item: item({ ...pending, question: asking }) }],
  'submit-reply': replyResults,
  'query-submit-reply': replyResults,
}

const invalidSuccess: Readonly<Record<Name, readonly object[]>> = {
  'list-cards': [
    { items: [], next: null, snapshotRef: 'snapshot-1' },
    { items: [], next: null, snapshotRef: 'snapshot-1', completeness: 'full' },
    {
      items: [item({ ...pending, kind: 'archived' })],
      next: null,
      snapshotRef: 'snapshot-1',
      completeness: 'complete',
    },
  ],
  'read-card': [
    { item: item(pending, { kind: 'person' }) },
    { item: item({ ...pending, revision: 'three' }) },
    { item: { card: pending, origin } },
  ],
  'submit-reply': [
    { kind: 'decided', decisionRef, revision: '4', delivery: 'superseded' },
    { kind: 'already-decided' },
    { kind: 'invalidated' },
  ],
  'query-submit-reply': [{ kind: 'decided', decisionRef, delivery: 'pending' }],
}

const names = Object.keys(operations) as Name[]
const cases = (samples: Readonly<Record<Name, readonly object[]>>) =>
  names.flatMap(name => samples[name].map(sample => [name, sample] as const))

describe('request bodies', () => {
  it.each(cases(validBodies))(
    '%s: a valid body reads and writes back as it was',
    (name, sample) => {
      expectRoundTrip(operations[name].body, sample)
    },
  )

  it.each(cases(invalidBodies))('%s: an invalid body is rejected', (name, sample) => {
    expect(readSample(operations[name].body, sample)).toEqual({ ok: false })
  })
})

describe('outcome bodies', () => {
  it.each(cases(successBodies))(
    '%s: a succeeded body reads and writes back as it was',
    (name, sample) => {
      expectRoundTrip(operations[name].outcomes.succeeded, sample)
    },
  )

  it.each(cases(invalidSuccess))('%s: an invalid succeeded body is rejected', (name, sample) => {
    expect(readSample(operations[name].outcomes.succeeded, sample)).toEqual({ ok: false })
  })

  it.each(names.filter(name => 'limited' in operations[name].outcomes))(
    '%s: limited carries resource and limit',
    name => {
      const codec = (
        operations[name].outcomes as { limited: Parameters<typeof expectRoundTrip>[0] }
      ).limited
      expectRoundTrip(codec, { resource: 'pool-items', limit: 7 })
      expect(readSample(codec, { resource: 'pool-items', limit: 0 })).toEqual({ ok: false })
      expect(readSample(codec, { resource: 'pool-items' })).toEqual({ ok: false })
    },
  )

  it('every other outcome with a codec has an empty body', () => {
    for (const name of names)
      for (const [outcome, codec] of Object.entries(operations[name].outcomes)) {
        if (outcome === 'succeeded' || outcome === 'limited' || codec === true) continue
        expect(expectRoundTrip(codec, {})).toEqual({})
        expect(readSample(codec, { reason: 'x' })).toEqual({ ok: false })
      }
  })
})
