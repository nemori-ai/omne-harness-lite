import { expect, it } from 'vitest'
import { GetOperationSchema, ListPoolSchema } from '../src/index.ts'

it('defaults the pool to pending cards and refuses unbounded or foreign fields', () => {
  const query = { protocol: 'hitl/1', tenantRef: 'tenant-a', locationRef: 'local', limit: 20 }
  expect(ListPoolSchema.parse(query).filter).toEqual({ states: ['pending'] })
  expect(ListPoolSchema.safeParse({ ...query, limit: 0 }).success).toBe(false)
  expect(ListPoolSchema.safeParse({ ...query, limit: 101 }).success).toBe(false)
  expect(ListPoolSchema.safeParse({ ...query, bypass: true }).success).toBe(false)
  expect(ListPoolSchema.safeParse({ ...query, filter: { states: [] } }).success).toBe(false)
})

it('requires an original command digest to inspect a write outcome', () => {
  const operationRef = { tenantRef: 'tenant-a', actorRef: 'human-a', operationId: 'original-a' }
  expect(GetOperationSchema.safeParse({ protocol: 'hitl/1', operationRef }).success).toBe(false)
  expect(
    GetOperationSchema.safeParse({ protocol: 'hitl/1', operationRef, inputDigest: 'digest-a' })
      .success,
  ).toBe(true)
})
