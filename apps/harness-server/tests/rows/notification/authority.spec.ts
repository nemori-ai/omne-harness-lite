import { describe, expect, it } from 'vitest'
import type { AuthorityAction } from '@omne-harness/notification'
import {
  sourceNameSchema,
  tenantIdSchema,
  type Actor,
  type CallContext,
  type Destination,
  type RecipientRef,
} from '@omne-harness/notification-contract'
import { createNotificationAuthority, mayDo } from '../../../src/rows/notification/authority.ts'

const person: RecipientRef = { kind: 'person' }
const agent = (ref: string): RecipientRef & { kind: 'agent' } => ({ kind: 'agent', ref })
const owner: Actor = { kind: 'owner' }
const agentA: Actor = { kind: 'agent', recipient: agent('session-a') }
const ACTORS = [
  ['the owner', owner],
  ['an agent', agentA],
] as const
const RECIPIENTS = [
  ['the person', person],
  ['the agent itself', agent('session-a')],
  ['another agent', agent('session-b')],
] as const
const SOURCES = ['owner.posts', 'agent.posts', 'schedule.jobs', 'notification.system'] as const
const TOWARDS = ['read-inbox', 'dispose', 'subscribe-for', 'manage-destinations'] as const

const isOwn = (actor: Actor, recipient: RecipientRef) =>
  actor.kind === 'owner'
    ? recipient.kind === 'person'
    : recipient.kind === 'agent' && recipient.ref === actor.recipient.ref

describe('who may do what with notifications', () => {
  describe.each(ACTORS)('%s', (_name, actor) => {
    it.each(SOURCES)('sends as %s only when that is its own source', source => {
      const own = actor.kind === 'owner' ? 'owner.posts' : 'agent.posts'
      expect(mayDo(actor, { kind: 'send-as', source: sourceNameSchema.parse(source) })).toBe(
        source === own,
      )
    })

    describe.each(RECIPIENTS)('towards %s', (_who, recipient) => {
      it.each(TOWARDS)('%s: only its own inbox, and destinations only for the owner', kind => {
        const expected =
          isOwn(actor, recipient) && (kind !== 'manage-destinations' || actor.kind === 'owner')
        expect(mayDo(actor, { kind, recipient })).toBe(expected)
      })

      it('admits the person and the actor itself as a recipient, and no other agent', () => {
        expect(mayDo(actor, { kind: 'be-recipient', recipient })).toBe(
          recipient.kind === 'person' || isOwn(actor, recipient),
        )
      })
    })

    it('lists the catalogue and knows every source', () => {
      expect(mayDo(actor, { kind: 'list-catalog' })).toBe(true)
      for (const source of SOURCES)
        expect(mayDo(actor, { kind: 'know-source', source: sourceNameSchema.parse(source) })).toBe(
          true,
        )
    })
  })
})

describe('the authority port', () => {
  const tenant = tenantIdSchema.parse('tenant/o/a')
  const ctx = (actor: Actor): CallContext => ({ tenant, subject: {}, actor })
  const authority = createNotificationAuthority()
  const destination = (channel: string) => ({ channel }) as unknown as Destination

  it('answers allowed or denied from the actor of the context, at every call', async () => {
    const read: AuthorityAction = { kind: 'read-inbox', recipient: person }
    expect(await authority.decide(ctx(owner), read)).toBe('allowed')
    expect(await authority.decide(ctx(agentA), read)).toBe('denied')
    expect(await authority.decide(ctx(owner), read)).toBe('allowed')
  })

  it('discloses everything to the surfaces of the application and only the title elsewhere', async () => {
    expect(await authority.disclosure(tenant, destination('in-app'))).toEqual({ kind: 'full' })
    expect(await authority.disclosure(tenant, destination('mail'))).toEqual({
      kind: 'title-only',
    })
  })
})
