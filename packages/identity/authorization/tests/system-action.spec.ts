import { describe, expect, it } from 'vitest'
import {
  decideSystemAction,
  digestOf,
  effectiveArgumentsOf,
  noArguments,
  type SystemActionFacts,
} from '@omne-harness/authorization'
import { adminTenant } from './support.ts'
import {
  ROWS,
  grantOf,
  installed,
  requestFor,
  row,
  targetOf,
  verifierAnswering,
} from './system-support.ts'

const PENDING = row('pending')
const REFERENCES = row('references')
const RECEIVE = row('receive')

describe('step 1: the principal is verified', () => {
  it('denies a hand-built principal of the right shape and reads no grant', async () => {
    const { scanner, grants, authorization } = installed()
    const decision = await authorization.check(requestFor({ ...scanner }, PENDING))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
    expect(grants.calls()).toBe(0)
  })

  it('denies when the verifier verifies a different object than the one in the request', async () => {
    const { scanner, grants, principals } = installed()
    const other = principals.coordinator
    const { authorization } = installed({
      verifier: verifierAnswering(() => Promise.resolve({ kind: 'verified', principal: other })),
      grants: grants.source,
    })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
    expect(grants.calls()).toBe(0)
  })

  it('is unavailable when the verifier cannot answer, and reads no grant', async () => {
    const { scanner, grants } = installed()
    const { authorization } = installed({
      verifier: verifierAnswering(() =>
        Promise.resolve({ kind: 'unavailable', diagnostic: 'down' }),
      ),
      grants: grants.source,
    })
    await expect(authorization.check(requestFor(scanner, PENDING))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'down',
    })
    expect(grants.calls()).toBe(0)
  })

  it('is unavailable, not allowed, when the verifier throws', async () => {
    const { scanner, grants } = installed()
    const { authorization } = installed({
      verifier: verifierAnswering(() => Promise.reject(new Error('secret detail'))),
      grants: grants.source,
    })
    await expect(authorization.check(requestFor(scanner, PENDING))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'the principal verifier threw an exception; its message is not reported',
    })
  })
})

describe('step 2: the operation and the target match the matrix', () => {
  it('denies an operation outside the matrix before any grant is read', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(ROWS.map(value => value.purpose)) })
    const decision = await authorization.check(
      requestFor(scanner, PENDING, { operation: { owner: 'session', name: 'readWork' } }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'operation-forbidden' })
    expect(grants.calls()).toBe(0)
  })

  it('denies an operation outside the matrix even when the grant source is not installed', async () => {
    const { scanner, authorization } = installed({ grants: null })
    const decision = await authorization.check(
      requestFor(scanner, PENDING, { operation: { owner: 'agent', name: 'references' } }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'operation-forbidden' })
  })

  it('denies a tenant target on a row that takes the system branch', async () => {
    const { scanner, grants, authorization } = installed()
    const decision = await authorization.check(
      requestFor(scanner, REFERENCES, {
        target: { kind: 'tenant', tenant: adminTenant(), resource: targetOf(REFERENCES).resource },
      }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
    expect(grants.calls()).toBe(0)
  })

  it('denies a system target on a row that takes the tenant branch', async () => {
    const { scanner, grants, authorization } = installed()
    const decision = await authorization.check(
      requestFor(scanner, PENDING, {
        target: { kind: 'system', resource: targetOf(PENDING).resource },
      }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
    expect(grants.calls()).toBe(0)
  })

  it('denies a resource of another owner', async () => {
    const { scanner, grants, authorization } = installed()
    const resource = { ...targetOf(PENDING).resource, owner: 'tool' }
    const decision = await authorization.check(
      requestFor(scanner, PENDING, { target: { kind: 'tenant', tenant: adminTenant(), resource } }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
    expect(grants.calls()).toBe(0)
  })

  it('denies a resource of another kind', async () => {
    const { scanner, grants, authorization } = installed()
    const resource = { ...targetOf(PENDING).resource, kind: 'session' }
    const decision = await authorization.check(
      requestFor(scanner, PENDING, { target: { kind: 'tenant', tenant: adminTenant(), resource } }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
    expect(grants.calls()).toBe(0)
  })
})

describe('step 3: the grant record', () => {
  it('denies grant-missing when the source knows no grant', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'none' })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
    expect(grants.calls()).toBe(1)
  })

  it('denies grant-missing when the record does not hold the purpose of the row', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['enumerate-tenants']) })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
  })

  it('denies grant-revoked for a revoked record that holds the purpose', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions'], { revoked: true }) })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-revoked' })
  })

  it('denies grant-expired when the clock says the end time is reached', async () => {
    const { scanner, grants, clock, authorization } = installed()
    clock.expire('2026-11-01T00:00:00Z')
    grants.script({
      kind: 'found',
      grant: grantOf(['pending-sessions'], { expiresAt: '2026-11-01T00:00:00Z' }),
    })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-expired' })
  })

  it('allows a grant whose end time is not reached yet', async () => {
    const { scanner, grants, clock, authorization } = installed()
    clock.pend('2099-01-01T00:00:00Z')
    grants.script({
      kind: 'found',
      grant: grantOf(['pending-sessions'], { expiresAt: '2099-01-01T00:00:00Z' }),
    })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision.kind).toBe('allowed')
    expect(clock.asked()).toEqual(['2099-01-01T00:00:00Z'])
  })

  it('does not ask the clock for a grant without an end time', async () => {
    const { scanner, grants, clock, authorization } = installed()
    clock.fail('clock down')
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions']) })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision.kind).toBe('allowed')
    expect(clock.asked()).toEqual([])
  })

  it('is unavailable, not denied, when the grant source cannot answer', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'unavailable', diagnostic: 'store down' })
    await expect(authorization.check(requestFor(scanner, PENDING))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'store down',
    })
  })

  it('is unavailable when no grant source is installed', async () => {
    const { scanner, authorization } = installed({ grants: null })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toEqual({
      kind: 'unavailable',
      diagnostic: 'no maintenance grant source is installed',
    })
  })

  it('is unavailable when the grant source throws', async () => {
    const { scanner, authorization } = installed({
      grants: { read: () => Promise.reject(new Error('secret detail')) },
    })
    await expect(authorization.check(requestFor(scanner, PENDING))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'the maintenance grant source threw an exception; its message is not reported',
    })
  })

  it('is unavailable when the clock cannot answer for a grant with an end time', async () => {
    const { scanner, grants, clock, authorization } = installed()
    clock.fail('clock down')
    grants.script({
      kind: 'found',
      grant: grantOf(['pending-sessions'], { expiresAt: '2099-01-01T00:00:00Z' }),
    })
    await expect(authorization.check(requestFor(scanner, PENDING))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'clock down',
    })
  })

  it('is unavailable when no clock is installed for a grant with an end time', async () => {
    const { scanner, grants, authorization } = installed({ clock: null })
    grants.script({
      kind: 'found',
      grant: grantOf(['pending-sessions'], { expiresAt: '2099-01-01T00:00:00Z' }),
    })
    await expect(authorization.check(requestFor(scanner, PENDING))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'no trusted clock is installed',
    })
  })

  it('is unavailable when the clock throws', async () => {
    const { scanner, grants, authorization } = installed({
      clock: { reached: () => Promise.reject(new Error('secret detail')) },
    })
    grants.script({
      kind: 'found',
      grant: grantOf(['pending-sessions'], { expiresAt: '2099-01-01T00:00:00Z' }),
    })
    await expect(authorization.check(requestFor(scanner, PENDING))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'the trusted clock threw an exception; its message is not reported',
    })
  })

  it('passes principal, operation and target to the source as they were asked', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'none' })
    const request = requestFor(scanner, PENDING)
    await authorization.check(request)
    expect(grants.requests()).toEqual([
      { principal: scanner, operation: request.operation, target: request.target },
    ])
  })
})

describe('step 4: the arguments', () => {
  it('denies binding-mismatch when a fixed row gets arguments other than none', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions']) })
    const decision = await authorization.check(
      requestFor(scanner, PENDING, { arguments: effectiveArgumentsOf({ extra: 1 }) }),
    )
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
    expect(grants.calls()).toBe(1)
  })

  it('records and does not compare the arguments of a row computed from the request', async () => {
    const { scanner, grants, authorization } = installed()
    const held = grantOf(['scope-release-receive'])
    grants.script({ kind: 'found', grant: held }, { kind: 'found', grant: held })
    const first = effectiveArgumentsOf({ fact: 'one' })
    const second = effectiveArgumentsOf({ fact: 'two' })
    const one = await authorization.check(requestFor(scanner, RECEIVE, { arguments: first }))
    const two = await authorization.check(requestFor(scanner, RECEIVE, { arguments: second }))
    if (one.kind !== 'allowed' || two.kind !== 'allowed') throw new Error('fixture')
    expect(one.basis.arguments).toEqual(first)
    expect(two.basis.arguments).toEqual(second)
    expect(one.evidence.digest).not.toBe(two.evidence.digest)
  })
})

describe('the order of the steps', () => {
  it('answers untrusted-principal before operation-forbidden', async () => {
    const { scanner, authorization } = installed()
    const decision = await authorization.check(
      requestFor({ ...scanner }, PENDING, { operation: { owner: 'x', name: 'y' } }),
    )
    expect(decision).toMatchObject({ reason: 'untrusted-principal' })
  })

  it('answers binding-mismatch of the target before reading a grant', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'none' })
    const decision = await authorization.check(
      requestFor(scanner, PENDING, {
        target: { kind: 'system', resource: targetOf(PENDING).resource },
      }),
    )
    expect(decision).toMatchObject({ reason: 'binding-mismatch' })
    expect(grants.calls()).toBe(0)
  })

  it('answers grant-missing before the arguments are compared', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'none' })
    const decision = await authorization.check(
      requestFor(scanner, PENDING, { arguments: effectiveArgumentsOf({ extra: 1 }) }),
    )
    expect(decision).toMatchObject({ reason: 'grant-missing' })
  })

  it('answers grant-revoked before grant-expired and does not ask the clock', async () => {
    const { scanner, grants, clock, authorization } = installed()
    clock.expire('2026-11-01T00:00:00Z')
    grants.script({
      kind: 'found',
      grant: grantOf(['pending-sessions'], { revoked: true, expiresAt: '2026-11-01T00:00:00Z' }),
    })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(decision).toMatchObject({ reason: 'grant-revoked' })
    expect(clock.asked()).toEqual([])
  })
})

describe('the pure judgment', () => {
  const factsFor = (scanner: object): SystemActionFacts => ({
    principal: { kind: 'verified', principal: scanner as never },
    grant: { kind: 'found', grant: grantOf(['pending-sessions']) },
    expiry: null,
  })

  it('is unavailable for a grant that was not read, and for an end time that was not read', () => {
    const { scanner } = installed()
    const request = requestFor(scanner, PENDING)
    expect(decideSystemAction(request, { ...factsFor(scanner), grant: null })).toMatchObject({
      kind: 'unavailable',
    })
    const timed: SystemActionFacts = {
      ...factsFor(scanner),
      grant: { kind: 'found', grant: grantOf(['pending-sessions'], { expiresAt: 'x' }) },
    }
    expect(decideSystemAction(request, timed)).toMatchObject({ kind: 'unavailable' })
  })

  it('gives the same decision for the same request and facts', () => {
    const { scanner } = installed()
    const request = requestFor(scanner, PENDING)
    expect(decideSystemAction(request, factsFor(scanner))).toEqual(
      decideSystemAction(request, factsFor(scanner)),
    )
  })

  it('keeps its own snapshot: a grant changed after the decision does not change its basis', () => {
    const { scanner } = installed()
    const purposes = ['pending-sessions']
    const decision = decideSystemAction(requestFor(scanner, PENDING), {
      ...factsFor(scanner),
      grant: { kind: 'found', grant: grantOf(purposes) },
    })
    purposes.push('enumerate-tenants')
    if (decision.kind !== 'allowed') throw new Error('fixture')
    expect(decision.basis.grant?.purposes).toEqual(['pending-sessions'])
    expect(Object.isFrozen(decision.basis.grant?.purposes)).toBe(true)
  })

  it('has the digest of null as the none arguments', () => {
    expect(noArguments().digest).toBe(digestOf(null))
  })
})
