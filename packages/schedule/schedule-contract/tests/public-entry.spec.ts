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
