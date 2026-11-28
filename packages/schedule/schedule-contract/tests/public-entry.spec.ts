import { expect, it } from 'vitest'
import * as contract from '@omne-harness/schedule-contract'

it('validates a strict trusted owner without accepting model-supplied additions', () => {
  expect(
    contract.ScheduleOwnerSchema.parse({ kind: 'tenant', tenantId: 'tenant', ownerId: 'owner' }),
  ).toEqual({ kind: 'tenant', tenantId: 'tenant', ownerId: 'owner' })
  expect(
    contract.ScheduleOwnerSchema.safeParse({
      kind: 'tenant',
      tenantId: 'tenant',
      ownerId: 'owner',
      role: 'admin',
    }).success,
  ).toBe(false)
})

it('names an agent author with its session and its call; who the author is leaves the call out', () => {
  const agent = {
    kind: 'agent',
    actorRef: 'principal/p',
    originatingSessionRef: 'session-1',
    originatingCallRef: 'call-1',
  } as const
  expect(contract.ScheduleAuthorSchema.parse(agent)).toEqual(agent)
  const { originatingCallRef: _call, ...withoutCall } = agent
  expect(contract.ScheduleAuthorSchema.safeParse(withoutCall).success).toBe(false)
  expect(contract.scheduleAuthorIdentity(agent)).toEqual(withoutCall)
  expect(contract.scheduleAuthorIdentity({ ...agent, originatingCallRef: 'call-2' })).toEqual(
    withoutCall,
  )
  const human = { kind: 'human', actorRef: 'acc' } as const
  expect(contract.scheduleAuthorIdentity(human)).toEqual(human)
})

it('constructs an operation locator before a server receipt exists', () => {
  const address = {
    protocol: 'omne.calendar-schedule/1',
    operation: 'schedule.pause',
    aggregate: { kind: 'entity', id: '00000000-0000-4000-8000-000000000001' },
    operationKey: 'original',
  }
  expect(
    contract.ScheduleOperationLocatorSchema.safeParse({
      kind: 'identity',
      identity: address,
      expectedFingerprint: 'a'.repeat(64),
    }).success,
  ).toBe(true)
  expect(
    contract.ScheduleOperationAddressSchema.safeParse({ ...address, operation: 'job.create' })
      .success,
  ).toBe(false)
})
