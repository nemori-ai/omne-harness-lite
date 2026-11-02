import { expect, it } from 'vitest'
import { harness, issue, open, scope, tenantA } from './support.js'

// The caller declaration that a Cordis provider passes to bind is a consistency check made after
// every access check, so it never tells a caller more than an unauthorized answer would.

it('bind compares the declared consumer class only after the access checks', async () => {
  const h = harness()
  const a = scope('bind/caller')
  await open(h, a, tenantA)
  const eligibility = await issue(h, a, tenantA, [], 'model')
  expect(await h.rc.bind(eligibility.id, { consumer: 'tool' })).toEqual({
    kind: 'refused',
    reason: 'callerMismatch',
  })
  expect(await h.rc.bind(eligibility.id, {})).toEqual({
    kind: 'refused',
    reason: 'callerMismatch',
  })
  expect((await h.rc.bind(eligibility.id, { consumer: 'model' })).kind).toBe('bound')
  expect((await h.rc.bind(eligibility.id)).kind).toBe('bound')
  expect(await h.rc.bind({ eligibility: 'eligibility-unknown' }, { consumer: 'tool' })).toEqual({
    kind: 'refused',
    reason: 'unauthorized',
  })
  h.ports.script(call => (call.face === 'reader' ? { kind: 'refused' } : undefined))
  expect(await h.rc.bind(eligibility.id, { consumer: 'tool' })).toEqual({
    kind: 'refused',
    reason: 'unauthorized',
  })
})
