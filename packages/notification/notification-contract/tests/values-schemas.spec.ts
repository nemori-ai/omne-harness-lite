import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  basisSchema,
  causeSchema,
  channelNameSchema,
  contentSchema,
  eventTypeNameSchema,
  instantSchema,
  levelSchema,
  locatorSchema,
  marksSchema,
  noteSchema,
  originSchema,
  parseWith,
  recipientKey,
  recipientRefSchema,
  sameIdentity,
  sameRecipient,
  scopeSchema,
  sendIdentitySchema,
  sendRequestSchema,
  sourceNameSchema,
  subscriptionChangeSchema,
  subscriptionKeySchema,
  tenantIdSchema,
  termSchema,
  type SendIdentity,
} from '@omne-harness/notification-contract'

const AT = '2026-11-18T06:00:00.000Z'
const KEY = {
  recipient: { kind: 'person' },
  source: 'demo.things',
  type: 'changed',
  scope: { kind: 'all' },
}
const EVENT = {
  type: 'changed',
  subject: null,
  at: AT,
  content: { title: 't', body: '', locator: null },
  replaceKey: null,
  renotify: false,
  named: [],
  origin: null,
}
const identity = { tenant: 't1', source: 'demo.things', eventId: 'e1' }

/** Each schema with values it takes and values that differ from one of them in one way and are refused. */
const CASES: readonly (readonly [string, z.ZodType, readonly unknown[], readonly unknown[]])[] = [
  ['tenant id', tenantIdSchema, ['t', 'x'.repeat(200)], ['', 'x'.repeat(201), 5]],
  [
    'source name',
    sourceNameSchema,
    ['demo.things', 'a.b', 'a1-b.c2-d', `${'a'.repeat(98)}.b`],
    [
      'demo',
      'demo.things.more',
      'Demo.things',
      'demo.Things',
      '1demo.things',
      'demo.1things',
      'demo.',
      '.things',
      ' demo.things',
      'demo.things ',
      'demo_x.things',
      'demo.thi_ngs',
      `${'a'.repeat(99)}.b`,
    ],
  ],
  [
    'event type name',
    eventTypeNameSchema,
    ['changed', 'job.failed', 'a.b.c', 'a1-b', 'a'.repeat(100)],
    [
      '',
      'Changed',
      '1changed',
      'job.',
      '.failed',
      'job..failed',
      'job.Failed',
      'job.1failed',
      'job_failed',
      'x changed',
      'changed x',
      'job.fai_led',
      'a'.repeat(101),
    ],
  ],
  [
    'channel name',
    channelNameSchema,
    ['in-app', 'a', 'a1', 'a'.repeat(100)],
    ['', 'In-app', '1app', 'in.app', 'in_app', ' in-app', 'in-app ', 'a'.repeat(101)],
  ],
  [
    'instant',
    instantSchema,
    [AT, '2024-02-29T23:59:59.999Z'],
    [
      '2026-11-18T06:00:00Z',
      '2026-11-18T06:00:00.00Z',
      '2026-11-18T06:00:00.0000Z',
      '2026-11-18 06:00:00.000Z',
      `x${AT}`,
      `${AT}x`,
      '2026-02-30T00:00:00.000Z',
      '2026-13-01T00:00:00.000Z',
      '2026-11-18T24:00:00.000Z',
      '2026-11-18T06:00:00.000+08:00',
    ],
  ],
  [
    'send identity',
    sendIdentitySchema,
    [identity, { ...identity, eventId: 'x'.repeat(200) }],
    [
      { ...identity, eventId: '' },
      { ...identity, eventId: 'x'.repeat(201) },
      { ...identity, extra: 1 },
      { tenant: 't1', source: 'demo.things' },
    ],
  ],
  [
    'recipient',
    recipientRefSchema,
    [{ kind: 'person' }, { kind: 'agent', ref: 'a' }, { kind: 'agent', ref: 'x'.repeat(200) }],
    [
      { kind: 'team' },
      { kind: 'agent' },
      { kind: 'agent', ref: '' },
      { kind: 'agent', ref: 'x'.repeat(201) },
      { kind: 'person', ref: 'a' },
      {},
    ],
  ],
  [
    'scope',
    scopeSchema,
    [
      { kind: 'all' },
      { kind: 'subject', equals: 'a' },
      { kind: 'subject-prefix', prefix: 'x'.repeat(500) },
      { kind: 'subject', equals: 'x'.repeat(500) },
    ],
    [
      { kind: 'subject', equals: '' },
      { kind: 'subject', equals: 'x'.repeat(501) },
      { kind: 'subject-prefix', prefix: '' },
      { kind: 'subject-prefix', prefix: 'x'.repeat(501) },
      { kind: 'all', equals: 'a' },
      { kind: 'subject', prefix: 'a' },
      { kind: 'none' },
    ],
  ],
  ['level', levelSchema, ['off', 'weak', 'strong'], ['', 'loud', 'Strong']],
  [
    'term',
    termSchema,
    [{ kind: 'standing' }, { kind: 'once' }, { kind: 'until', at: AT }],
    [
      { kind: 'until' },
      { kind: 'until', at: 'tomorrow' },
      { kind: 'forever' },
      { kind: 'once', at: AT },
    ],
  ],
  [
    'basis',
    basisSchema,
    [
      { kind: 'owner' },
      { kind: 'blanket', generation: 0 },
      { kind: 'granular', decision: 'd' },
      { kind: 'granular', decision: 'x'.repeat(200) },
    ],
    [
      { kind: 'blanket' },
      { kind: 'blanket', generation: -1 },
      { kind: 'blanket', generation: 1.5 },
      { kind: 'granular' },
      { kind: 'granular', decision: '' },
      { kind: 'granular', decision: 'x'.repeat(201) },
      { kind: 'owner', generation: 1 },
      { kind: 'self' },
      {},
    ],
  ],
  ['note', noteSchema, ['n', 'x'.repeat(500)], ['', 'x'.repeat(501)]],
  [
    'cause',
    causeSchema,
    [
      { kind: 'named' },
      { kind: 'type-default' },
      { kind: 'subscription', scope: { kind: 'all' }, note: null },
      { kind: 'subscription', scope: { kind: 'all' }, note: 'n' },
    ],
    [
      { kind: 'subscription' },
      { kind: 'subscription', scope: { kind: 'all' } },
      { kind: 'subscription', scope: { kind: 'all' }, note: '' },
      { kind: 'named', note: null },
      { kind: 'other' },
      {},
    ],
  ],
  [
    'marks',
    marksSchema,
    [
      { seenAt: null, resolved: null, supersededBy: null },
      { seenAt: AT, resolved: { how: 'done', at: AT }, supersededBy: identity },
      { seenAt: null, resolved: { how: 'dismissed', at: AT }, supersededBy: null },
    ],
    [
      { seenAt: null, resolved: null },
      { seenAt: 'x', resolved: null, supersededBy: null },
      { seenAt: null, resolved: { how: 'gone', at: AT }, supersededBy: null },
      { seenAt: null, resolved: { how: 'done' }, supersededBy: null },
      { seenAt: null, resolved: null, supersededBy: { source: 'demo.things' } },
      { seenAt: null, resolved: null, supersededBy: null, extra: 1 },
    ],
  ],
  [
    'locator',
    locatorSchema,
    [
      { kind: 'k', ref: 'r' },
      { kind: 'x'.repeat(64), ref: 'x'.repeat(500) },
    ],
    [
      { kind: '', ref: 'r' },
      { kind: 'k', ref: '' },
      { kind: 'x'.repeat(65), ref: 'r' },
      { kind: 'k', ref: 'x'.repeat(501) },
      { kind: 'k' },
    ],
  ],
  [
    'content',
    contentSchema,
    [
      { title: 't', body: '', locator: null },
      { title: 'x'.repeat(200), body: 'b', locator: { kind: 'k', ref: 'r' } },
    ],
    [
      { title: '', body: '', locator: null },
      { title: 'x'.repeat(201), body: '', locator: null },
      { title: 't', locator: null },
      { title: 't', body: '' },
    ],
  ],
  [
    'origin',
    originSchema,
    [
      { emitter: { kind: 'agent', ref: 'a' }, depth: 0 },
      { emitter: { kind: 'person' }, depth: 3 },
    ],
    [
      { emitter: { kind: 'agent', ref: 'a' }, depth: -1 },
      { emitter: { kind: 'agent', ref: 'a' }, depth: 0.5 },
      { emitter: { kind: 'agent', ref: 'a' } },
      { depth: 0 },
    ],
  ],
]

describe('the values of the contract', () => {
  it.each(CASES)(
    '%s: takes what it should and refuses each near miss',
    (_name, schema, good, bad) => {
      for (const value of good)
        expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(true)
      for (const value of bad)
        expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false)
    },
  )

  it('two send identities are the same only when tenant, source and event are all the same', () => {
    const a = sendIdentitySchema.parse(identity)
    const differing = (field: keyof SendIdentity, value: string) =>
      sendIdentitySchema.parse({ ...identity, [field]: value })
    expect(sameIdentity(a, sendIdentitySchema.parse({ ...identity }))).toBe(true)
    expect(sameIdentity(a, differing('tenant', 't2'))).toBe(false)
    expect(sameIdentity(a, differing('source', 'other.things'))).toBe(false)
    expect(sameIdentity(a, differing('eventId', 'e2'))).toBe(false)
  })

  it('a recipient key tells the person from every agent, and one agent from another', () => {
    expect(recipientKey({ kind: 'person' })).toBe('person')
    expect(recipientKey({ kind: 'agent', ref: 'a' })).toBe('agent:a')
    expect(sameRecipient({ kind: 'agent', ref: 'a' }, { kind: 'agent', ref: 'a' })).toBe(true)
    expect(sameRecipient({ kind: 'agent', ref: 'a' }, { kind: 'agent', ref: 'b' })).toBe(false)
    expect(sameRecipient({ kind: 'person' }, { kind: 'agent', ref: 'person' })).toBe(false)
  })

  it.each([
    [
      sendRequestSchema,
      { identity: { ...identity, source: 'Bad' }, event: {} },
      'invalid-source-name',
    ],
    [sendIdentitySchema, { ...identity, source: 'Bad' }, 'invalid-source-name'],
    [
      sendRequestSchema,
      { identity: { ...identity, eventId: '' }, event: {} },
      'incomplete-identity',
    ],
    [
      sendRequestSchema,
      { identity: { tenant: 't1', source: 'demo.things' }, event: {} },
      'incomplete-identity',
    ],
    [
      sendRequestSchema,
      {
        identity,
        event: { ...EVENT, content: { title: 't', body: 'x'.repeat(65_537), locator: null } },
      },
      'content-too-large',
    ],
    [
      sendRequestSchema,
      { identity, event: { ...EVENT, content: { title: '', body: '', locator: null } } },
      'invalid-request',
    ],
    [subscriptionKeySchema, { ...KEY, scope: { kind: 'subject', equals: '' } }, 'invalid-scope'],
    [
      subscriptionChangeSchema,
      { ...KEY, level: 'weak', note: null, term: { kind: 'until', at: 'x' } },
      'invalid-term',
    ],
    [
      subscriptionChangeSchema,
      { ...KEY, level: 'loud', note: null, term: { kind: 'once' } },
      'invalid-request',
    ],
    [sendIdentitySchema, { ...identity, eventId: '' }, 'invalid-request'],
    [sendIdentitySchema, null, 'invalid-request'],
    [
      subscriptionKeySchema,
      { ...KEY, type: 'Bad Type', scope: { kind: 'subject', equals: '' } },
      'invalid-request',
    ],
  ] as const)(
    'parsing %# names the refusal by where the first problem is',
    (schema, input, refusal) => {
      expect(parseWith(schema as never, input)).toEqual({ refused: refusal })
    },
  )

  it('parsing gives the parsed value when nothing is wrong', () => {
    expect(parseWith(sendIdentitySchema, identity)).toEqual({ ok: identity })
  })
})
