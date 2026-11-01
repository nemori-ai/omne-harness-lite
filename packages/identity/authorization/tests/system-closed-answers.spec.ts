// Answers outside the contract never become a permission (SPEC AU-12): a clock, a grant source
// or a grant record that does not answer in the agreed shape is `unavailable`, never `allowed`.
import { describe, expect, it } from 'vitest'
import {
  decideSystemAction,
  type MaintenanceGrant,
  type SystemActionFacts,
  type SystemActionRequest,
} from '@omne-harness/authorization'
import { grantOf, installed, requestFor, row, verifierAnswering } from './system-support.ts'

const PENDING = row('pending')
const END = '2099-01-01T00:00:00Z'

const timed = () => grantOf(['pending-sessions'], { expiresAt: END })
const strange = (value: unknown) => value as never
const foreign = (value: object) => value as unknown as Partial<SystemActionRequest>

describe('an answer of the trusted clock that is not reached or pending', () => {
  it.each([
    ['an empty answer', {}],
    ['an unknown kind', { kind: 'expired' }],
    ['a kind in other letters', { kind: 'Reached' }],
    ['a kind that is not text', { kind: 1 }],
  ])('is unavailable for %s, never allowed', async (_name, answer) => {
    const { scanner, grants, authorization } = installed({
      clock: { reached: () => Promise.resolve(strange(answer)) },
    })
    grants.script({ kind: 'found', grant: timed() })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision.kind).toBe('unavailable')
  })

  it('is unavailable in the pure judgment for a reading of an unknown kind', () => {
    const { scanner } = installed()
    const facts: SystemActionFacts = {
      principal: { kind: 'verified', principal: scanner },
      grant: { kind: 'found', grant: timed() },
      expiry: strange({ kind: 'expired' }),
    }
    expect(decideSystemAction(requestFor(scanner, PENDING), facts).kind).toBe('unavailable')
  })
})

describe('a grant record whose revoked member is not the boolean false', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['0', 0],
    ['the text false', 'false'],
  ])('is unavailable for revoked %s, and does not ask the clock', async (_name, value) => {
    const { scanner, grants, clock, authorization } = installed()
    grants.script({
      kind: 'found',
      grant: grantOf(['pending-sessions'], { revoked: value as never, expiresAt: END }),
    })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision.kind).toBe('unavailable')
    expect(clock.asked()).toEqual([])
  })

  it('is unavailable in the pure judgment, and a revoked true is still grant-revoked', () => {
    const { scanner } = installed()
    const factsFor = (grant: MaintenanceGrant): SystemActionFacts => ({
      principal: { kind: 'verified', principal: scanner },
      grant: { kind: 'found', grant },
      expiry: null,
    })
    const request = requestFor(scanner, PENDING)
    expect(
      decideSystemAction(request, factsFor(grantOf(['pending-sessions'], { revoked: strange(0) })))
        .kind,
    ).toBe('unavailable')
    expect(
      decideSystemAction(request, factsFor(grantOf(['pending-sessions'], { revoked: true }))),
    ).toMatchObject({ kind: 'denied', reason: 'grant-revoked' })
  })
})

describe('an answer of the grant source of an unknown kind', () => {
  it.each([
    ['allowed', { kind: 'allowed' }],
    ['an empty answer', {}],
    ['a kind in other letters', { kind: 'Found' }],
  ])('is unavailable for %s, and check does not reject', async (_name, answer) => {
    const { scanner, authorization } = installed({
      grants: { read: () => Promise.resolve(strange(answer)) },
    })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision.kind).toBe('unavailable')
  })
})

describe('the principal and the scope of the request', () => {
  it('denies untrusted-principal when the verified principal is not of kind system', async () => {
    const { grants } = installed()
    const notSystem = { kind: 'tenant', component: 'restart-scanner' }
    const { authorization } = installed({
      verifier: verifierAnswering(() =>
        Promise.resolve({ kind: 'verified', principal: strange(notSystem) }),
      ),
      grants: grants.source,
    })
    const { scanner } = installed()
    const decision = await authorization.check(requestFor(strange(notSystem), PENDING))
    expect(scanner.kind).toBe('system')
    expect(decision).toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
    expect(grants.calls()).toBe(0)
  })

  it('denies binding-mismatch when the scope is not system, and reads no grant', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions']) })
    const decision = await authorization.check(
      requestFor(scanner, PENDING, foreign({ scope: 'tenant' })),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
    expect(grants.calls()).toBe(0)
  })

  it('answers operation-forbidden before the scope is compared', async () => {
    const { scanner, authorization } = installed()
    const decision = await authorization.check(
      requestFor(scanner, PENDING, {
        ...foreign({ scope: 'tenant' }),
        operation: { owner: 'x', name: 'y' },
      }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'operation-forbidden' })
  })
})

describe('what the decision rested on', () => {
  it('does not ask the clock when the record does not hold the purpose of the row', async () => {
    const { scanner, grants, clock, authorization } = installed()
    grants.script({
      kind: 'found',
      grant: grantOf(['enumerate-tenants'], { expiresAt: END }),
    })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
    expect(clock.asked()).toEqual([])
  })

  it('keeps a frozen own snapshot of the target in the basis', async () => {
    const { scanner, grants, clock, authorization } = installed()
    clock.pend(END)
    grants.script({ kind: 'found', grant: timed() })
    const request = requestFor(scanner, PENDING)
    const decision = await authorization.check(request)
    if (decision.kind !== 'allowed') throw new Error('fixture')
    expect(decision.basis.target).not.toBe(request.target)
    expect(decision.basis.target.resource).not.toBe(request.target.resource)
    expect(Object.isFrozen(decision.basis.target)).toBe(true)
    expect(Object.isFrozen(decision.basis.target.resource)).toBe(true)
  })
})
