import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { digestOf } from '@omne-harness/authorization'
import { grantOf, installed, requestFor, row } from './system-support.ts'

const PENDING = row('pending')

describe('the evidence of a system action decision', () => {
  it('carries the grant record and revision, and a digest that can be recomputed, when allowed', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions']) })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    if (decision.kind !== 'allowed') throw new Error('fixture')
    expect(decision.evidence).toMatchObject({
      owner: 'authorization',
      record: 'grant_1',
      revision: '7',
    })
    expect(decision.evidence.digest).toBe(digestOf({ kind: 'allowed', basis: decision.basis }))
    expect(decision.basis.grant).toMatchObject({ record: 'grant_1', generation: 'gen_1' })
    expect(decision.basis.principal).toBe(scanner)
  })

  it('does not match a digest recomputed from a changed basis', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions']) })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    if (decision.kind !== 'allowed') throw new Error('fixture')
    const changed = { ...decision.basis, operation: { owner: 'session', name: 'receive' } }
    expect(digestOf({ kind: 'allowed', basis: changed })).not.toBe(decision.evidence.digest)
  })

  it('carries the reason in the digest of a denial', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions'], { revoked: true }) })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    if (decision.kind !== 'denied') throw new Error('fixture')
    expect(decision.evidence.digest).toBe(
      digestOf({ kind: 'denied', reason: 'grant-revoked', basis: decision.basis }),
    )
    expect(decision.evidence).toMatchObject({ record: 'grant_1', revision: '7' })
  })

  it('names the admission and revision 0 for a denial before any grant was read', async () => {
    const { scanner, authorization } = installed()
    const decision = await authorization.check(
      requestFor(scanner, PENDING, { operation: { owner: 'session', name: 'readWork' } }),
    )
    if (decision.kind !== 'denied') throw new Error('fixture')
    expect(decision.evidence).toMatchObject({
      owner: 'authorization',
      record: 'system-admission/session/readWork',
      revision: '0',
    })
    expect(decision.basis.grant).toBeNull()
    expect(decision.evidence.digest).toBe(
      digestOf({ kind: 'denied', reason: 'operation-forbidden', basis: decision.basis }),
    )
  })

  it('names the admission and revision 0 for an untrusted principal, with no principal in the basis', async () => {
    const { scanner, authorization } = installed()
    const decision = await authorization.check(requestFor({ ...scanner }, PENDING))
    if (decision.kind !== 'denied') throw new Error('fixture')
    expect(decision.evidence).toMatchObject({
      record: 'system-admission/session/pending',
      revision: '0',
    })
    expect(decision.basis.principal).toBeNull()
  })

  it('names the admission and revision 0 for grant-missing when the source knows no grant', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'none' })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    if (decision.kind !== 'denied') throw new Error('fixture')
    expect(decision.evidence).toMatchObject({
      record: 'system-admission/session/pending',
      revision: '0',
    })
  })

  it('has no evidence member on unavailable', async () => {
    const { scanner, grants, authorization } = installed()
    grants.script({ kind: 'unavailable', diagnostic: 'store down' })
    const decision = await authorization.check(requestFor(scanner, PENDING))
    expect(Object.keys(decision).sort()).toEqual(['diagnostic', 'kind'])
  })
})

describe('revocation takes effect at the next check', () => {
  it('denies grant-revoked on the second check after a revoke between two checks', async () => {
    const { scanner, grants, authorization } = installed()
    const request = requestFor(scanner, PENDING)
    grants.script(
      { kind: 'found', grant: grantOf(['pending-sessions']) },
      { kind: 'found', grant: grantOf(['pending-sessions'], { revoked: true, revision: '8' }) },
    )
    const first = await authorization.check(request)
    const second = await authorization.check(request)
    expect(first.kind).toBe('allowed')
    expect(second).toMatchObject({ kind: 'denied', reason: 'grant-revoked' })
    expect(second.kind === 'denied' && second.evidence.revision).toBe('8')
  })

  it('denies grant-expired on the second check after the end time passes', async () => {
    const { scanner, grants, clock, authorization } = installed()
    const request = requestFor(scanner, PENDING)
    const held = grantOf(['pending-sessions'], { expiresAt: '2026-11-02T00:00:00Z' })
    grants.script({ kind: 'found', grant: held }, { kind: 'found', grant: held })
    clock.pend('2026-11-02T00:00:00Z')
    const first = await authorization.check(request)
    clock.expire('2026-11-02T00:00:00Z')
    const second = await authorization.check(request)
    expect(first.kind).toBe('allowed')
    expect(second).toMatchObject({ kind: 'denied', reason: 'grant-expired' })
  })

  it('answers unavailable on the second check when the source goes away, and keeps no earlier allowed', async () => {
    const { scanner, grants, authorization } = installed()
    const request = requestFor(scanner, PENDING)
    grants.script({ kind: 'found', grant: grantOf(['pending-sessions']) })
    await authorization.check(request)
    // The script is exhausted: the double answers unavailable, never a repeat of the last answer.
    await expect(authorization.check(request)).resolves.toMatchObject({ kind: 'unavailable' })
  })

  it('reads the grant again on every check', async () => {
    const { scanner, grants, authorization } = installed()
    const request = requestFor(scanner, PENDING)
    const held = grantOf(['pending-sessions'])
    grants.script({ kind: 'found', grant: held }, { kind: 'found', grant: held })
    await authorization.check(request)
    await authorization.check(request)
    expect(grants.calls()).toBe(2)
  })
})

describe('the module has no fence', () => {
  it('names no fence in its source files', () => {
    const directory = join(import.meta.dirname, '..', 'src')
    const files = readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry =>
      entry.isFile(),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = readFileSync(join(file.parentPath, file.name), 'utf8')
      expect(text, file.name).not.toMatch(/fence|auth_fence|access-fence/i)
    }
  })
})
