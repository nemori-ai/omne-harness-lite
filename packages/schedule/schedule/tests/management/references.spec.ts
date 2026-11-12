import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'
import { expect, it } from 'vitest'
import {
  createScheduleManagementIdentity,
  createScheduleDefinitionRef,
  createScheduleRecordRef,
} from '@omne-harness/schedule'
import { createInput, scope, record } from './fixtures.ts'

it('uses the versioned JCS tuples and the UUIDv8 variant', () => {
  const request = createInput().request
  const identity = createScheduleManagementIdentity(scope, request)
  const text = canonicalize(['omne.schedule.management.operation/1', scope, identity.address])
  if (text === undefined) throw new Error('fixture')
  const bytes = createHash('sha256').update(text).digest().subarray(0, 16)
  bytes[6] = (bytes.readUInt8(6) & 15) | 128
  bytes[8] = (bytes.readUInt8(8) & 63) | 128
  expect(identity.operationRef.replaceAll('-', '')).toBe(bytes.toString('hex'))
  const view = record().view
  for (const [actual, tuple] of [
    [
      createScheduleDefinitionRef(view),
      [
        'omne.schedule.definition/1',
        view.owner,
        view.scheduleId,
        view.definitionRevision,
        view.definition,
      ],
    ],
    [
      createScheduleRecordRef(view),
      ['omne.schedule.record/1', view.owner, view.scheduleId, view.revision],
    ],
  ] as const) {
    const encoded = canonicalize(tuple)
    if (encoded === undefined) throw new Error('fixture')
    expect(actual).toBe(createHash('sha256').update(encoded).digest('hex'))
  }
})

it('keeps address stable across payload changes but separates principal and source session', () => {
  const request = createInput().request
  if (request.kind !== 'create') throw new Error('fixture')
  const first = createScheduleManagementIdentity(scope, request)
  const changed = createScheduleManagementIdentity(scope, {
    ...request,
    input: { ...request.input, definition: { ...request.input.definition, label: 'Other' } },
  })
  expect(changed.operationRef).toBe(first.operationRef)
  expect(changed.fingerprint).not.toBe(first.fingerprint)
  expect(
    createScheduleManagementIdentity({ ...scope, principalRef: 'other' }, request).operationRef,
  ).not.toBe(first.operationRef)
  expect(
    createScheduleManagementIdentity({ ...scope, originatingSessionRef: 'session:other' }, request)
      .operationRef,
  ).not.toBe(first.operationRef)
})
