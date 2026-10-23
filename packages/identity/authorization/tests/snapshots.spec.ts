import { describe, expect, it } from 'vitest'
import type { Qualification } from '@omne-harness/identity'
import {
  canonicalText,
  decideAdmission,
  decodePermitId,
  digestOf,
  effectiveArgumentsOf,
  inMemoryPermitLedger,
  type AdmissionFacts,
} from '@omne-harness/authorization'
import { adminTenant, issued, memberTenant, tenantKey } from './support.ts'

function grantInput() {
  return {
    tenant: adminTenant(),
    operation: { owner: 'tool', name: 'read' },
    target: { owner: 'tool', kind: 'file', key: 'public' },
    arguments: { ...effectiveArgumentsOf({ path: 'public' }) },
    granted: { owner: 'hitl', record: 'approval-public-read', revision: '1', digest: 'original' },
  }
}

function member() {
  return {
    kind: 'member' as const,
    role: { model: { model: 'default-team', revision: '1' }, role: 'super-admin' },
    qualifications: ['organization-cost-ledger-read'] satisfies Qualification[],
    evidence: { record: 'membership', revision: '1' },
  }
}

function expectFrozen(value: object) {
  expect(Object.isFrozen(value)).toBe(true)
  for (const key of Object.keys(value)) expect(Reflect.set(value, key, 'changed')).toBe(false)
}

describe('stored authorization snapshots', () => {
  it('keeps a grant bound to the approved action when the caller changes its input', async () => {
    const { grantor, ledger } = inMemoryPermitLedger()
    const input = grantInput()
    const outcome = await grantor.grant(input)
    if (outcome.kind !== 'granted') throw new Error('fixture grant failed')
    const grant = outcome.grant
    const original = canonicalText(grant)
    const principal = issued().actingFor(input.tenant)
    const facts: AdmissionFacts = {
      principal: { kind: 'verified', principal },
      standing: member(),
      permit: await ledger.lookup({ permit: grant.ref }),
    }

    input.operation.owner = 'changed-owner'
    input.operation.name = 'delete'
    input.target.owner = 'changed-owner'
    input.target.kind = 'directory'
    input.target.key = 'private'
    input.arguments.digest = effectiveArgumentsOf({ path: 'private' }).digest
    Object.assign(input.granted, {
      owner: 'other',
      record: 'other',
      revision: '2',
      digest: 'other',
    })

    const rewritten = decideAdmission(
      {
        access: { principal, tenant: input.tenant },
        operation: input.operation,
        target: input.target,
        arguments: input.arguments,
        requires: [],
        permit: grant.ref,
      },
      facts,
    )
    expect(rewritten).toMatchObject({ kind: 'denied', reason: 'permit-mismatch' })
    expect(canonicalText(grant)).toBe(original)
    expect(grant.ref.tenant).toBe(input.tenant)
    for (const value of [
      grant,
      grant.ref,
      grant.operation,
      grant.target,
      grant.arguments,
      grant.granted,
    ]) {
      expectFrozen(value)
    }
    const lookup = await ledger.lookup({ permit: grant.ref })
    if (lookup.kind !== 'found') throw new Error('fixture lookup failed')
    expect(canonicalText(lookup.grant)).toBe(original)
    expectFrozen(lookup.grant.target)

    const originalRequest = {
      access: { principal, tenant: input.tenant },
      operation: grant.operation,
      target: grant.target,
      arguments: grant.arguments,
      requires: [],
      permit: grant.ref,
    }
    expect(decideAdmission(originalRequest, facts).kind).toBe('allowed')
    const consumer = { owner: 'tool', work: 'read-public', position: 'start' }
    expect((await ledger.consume({ permit: grant.ref, consumer })).kind).toBe('consumed')
    expect((await ledger.consume({ permit: grant.ref, consumer })).kind).toBe('already-consumed')
    expect(
      decideAdmission(originalRequest, {
        ...facts,
        permit: await ledger.lookup({ permit: grant.ref }),
      }),
    ).toMatchObject({ kind: 'denied', reason: 'permit-consumed' })
  })

  it('keeps the original consumption position and evidence after input and result mutation attempts', async () => {
    const { grantor, ledger } = inMemoryPermitLedger()
    const granted = await grantor.grant(grantInput())
    if (granted.kind !== 'granted') throw new Error('fixture grant failed')
    const permit = { ...granted.grant.ref }
    const consumer = { owner: 'tool', work: 'read-public', position: 'start' }
    const consumed = await ledger.consume({ permit, consumer })
    if (consumed.kind !== 'consumed') throw new Error('fixture consume failed')
    const original = canonicalText(consumed.fact)
    Object.assign(consumer, { owner: 'other', work: 'delete-private', position: 'other' })
    permit.tenant = memberTenant()
    for (const value of [
      consumed.fact,
      consumed.fact.permit,
      consumed.fact.consumer,
      consumed.fact.evidence,
    ]) {
      expectFrozen(value)
    }
    const repeated = await ledger.consume({ permit: granted.grant.ref, consumer })
    expect(repeated).toEqual({ kind: 'already-consumed', fact: consumed.fact })
    expect(canonicalText(consumed.fact)).toBe(original)
    expect(consumed.fact.permit.tenant).toBe(granted.grant.ref.tenant)
    const key = `${tenantKey(consumed.fact.permit.tenant)}#${consumed.fact.permit.permit}`
    expect(consumed.fact.evidence.digest).toBe(
      digestOf({ permit: key, consumer: consumed.fact.consumer }),
    )
  })

  it.each(['allowed', 'qualification-missing', 'not-member'] as const)(
    'keeps the %s basis and its digest stable while preserving identity references',
    async result => {
      const { grantor, ledger } = inMemoryPermitLedger()
      const input = grantInput()
      const granted = await grantor.grant(input)
      if (granted.kind !== 'granted') throw new Error('fixture grant failed')
      const authority = issued()
      const principal = authority.actingFor(input.tenant)
      const standing =
        result === 'not-member'
          ? { kind: 'not-member' as const, evidence: { record: 'membership', revision: '1' } }
          : member()
      if (result === 'qualification-missing' && standing.kind === 'member')
        standing.qualifications.length = 0
      const required: Qualification[] = ['organization-cost-ledger-read']
      const permit = { ...granted.grant.ref }
      const decision = decideAdmission(
        {
          access: { principal, tenant: input.tenant },
          operation: input.operation,
          target: input.target,
          arguments: input.arguments,
          requires: required,
          permit,
        },
        {
          principal: await authority.authority.verifier.verify(principal),
          standing,
          permit: await ledger.lookup({ permit }),
        },
      )
      expect(decision.kind).toBe(result === 'allowed' ? 'allowed' : 'denied')
      if (decision.kind === 'unavailable') throw new Error('fixture decision unavailable')
      if (decision.kind === 'denied') expect(decision.reason).toBe(result)
      const original = canonicalText(decision.basis)

      Object.assign(input.operation, { owner: 'other', name: 'delete' })
      Object.assign(input.target, { owner: 'other', kind: 'directory', key: 'private' })
      input.arguments.digest = 'changed'
      required.length = 0
      const otherPermit = decodePermitId('other-permit')
      if ('failure' in otherPermit) throw new Error('fixture permit failed')
      permit.permit = otherPermit.ok
      permit.tenant = memberTenant()
      Object.assign(standing.evidence, { record: 'other', revision: '2' })
      if (standing.kind === 'member') {
        standing.role.role = 'other'
        standing.role.model.model = 'other'
        standing.role.model.revision = '2'
        standing.qualifications.push('organization-cost-ledger-read')
      }

      expect(canonicalText(decision.basis)).toBe(original)
      expect(decision.basis.principal).toBe(principal)
      expect(decision.basis.tenant).toBe(input.tenant)
      expect(decision.basis.permit?.tenant).toBe(input.tenant)
      for (const value of [
        decision,
        decision.evidence,
        decision.basis,
        decision.basis.operation,
        decision.basis.target,
        decision.basis.arguments,
        decision.basis.required,
        decision.basis.permit,
        decision.basis.standing,
        decision.basis.standing?.evidence,
      ]) {
        if (value != null) expectFrozen(value)
      }
      if (decision.basis.standing?.kind === 'member') {
        expectFrozen(decision.basis.standing.role)
        expectFrozen(decision.basis.standing.role.model)
        expectFrozen(decision.basis.standing.qualifications)
      }
      const content =
        decision.kind === 'allowed'
          ? { kind: decision.kind, basis: decision.basis }
          : { kind: decision.kind, reason: decision.reason, basis: decision.basis }
      expect(decision.evidence.digest).toBe(digestOf(content))
    },
  )
})
