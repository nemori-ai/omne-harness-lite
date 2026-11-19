import { describe, expect, it } from 'vitest'
import { inputSourceName, sourceRequestIdentities } from '@omne-harness/session-contract'
import { memoryAccess, memoryOtherAccess } from '@omne-harness/session-contract/testing'

const A = memoryAccess('a').tenant
const B = memoryOtherAccess('b').tenant
const TASK = inputSourceName('probe.task')
const NOTE = inputSourceName('probe.note')

describe('the identities of a request a registered source sends (SE-32)', () => {
  it('gives the same session, input and operations for the same tenant, source and request', () => {
    const first = sourceRequestIdentities({ tenant: A, source: TASK, request: 'job-7/run-1' })
    const again = sourceRequestIdentities({ tenant: A, source: TASK, request: 'job-7/run-1' })
    expect(again).toEqual(first)
    expect(first.session).toMatch(/^[0-9a-f]{64}$/u)
    expect(first.input).toMatch(/^[0-9a-f]{64}$/u)
    expect(first.create).toMatch(/^sop_[0-9a-f]{64}$/u)
    expect(first.accept).toMatch(/^sop_[0-9a-f]{64}$/u)
    expect(new Set(Object.values(first)).size).toBe(4)
  })

  it('gives other identities for another tenant, another source or another request', () => {
    const base = { tenant: A, source: TASK, request: 'r-1' }
    const one = sourceRequestIdentities(base)
    for (const other of [
      { ...base, tenant: B },
      { ...base, source: NOTE },
      { ...base, request: 'r-2' },
    ]) {
      const two = sourceRequestIdentities(other)
      for (const member of ['session', 'input', 'create', 'accept'] as const)
        expect(two[member], member).not.toBe(one[member])
    }
  })

  it('an input to a session that is there keeps that session and derives its own input and operation', () => {
    const created = sourceRequestIdentities({ tenant: A, source: TASK, request: 'r-1' })
    const sent = sourceRequestIdentities({
      tenant: A,
      source: NOTE,
      request: 'note-1',
      session: created.session,
    })
    expect(sent.session).toBe(created.session)
    expect(sent.input).not.toBe(created.input)
    const elsewhere = sourceRequestIdentities({
      tenant: A,
      source: NOTE,
      request: 'note-1',
      session: 'another-session' as typeof created.session,
    })
    expect(elsewhere.input).not.toBe(sent.input)
    expect(elsewhere.accept).not.toBe(sent.accept)
  })

  it('refuses an empty request identity and a tenant that was not minted', () => {
    expect(() => sourceRequestIdentities({ tenant: A, source: TASK, request: '' })).toThrow(
      TypeError,
    )
    expect(() =>
      sourceRequestIdentities({ tenant: {} as typeof A, source: TASK, request: 'r' }),
    ).toThrow(TypeError)
  })
})
