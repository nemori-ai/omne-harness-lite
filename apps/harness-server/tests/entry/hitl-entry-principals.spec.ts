import { describe, expect, it } from 'vitest'
import { OriginSchema, type Origin } from '@omne-harness/human-intervention'
import {
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type PrincipalIssuer,
} from '@omne-harness/identity'
import {
  HITL_ENTRY_COMPONENT,
  HITL_ENTRY_WORK,
  createHitlEntryPrincipals,
  hitlCardAudience,
  hitlEntryRef,
} from '../../src/entry/hitl-entry-principals.ts'
import { fixtureTenant } from './support.ts'

const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')

async function issued(issuer: PrincipalIssuer, tenant = tenantA) {
  const answer = await createHitlEntryPrincipals(issuer).issue({ account: tenant.account, tenant })
  if (answer.kind !== 'issued') throw new Error('the holder refused')
  return answer.principal
}

describe('the HITL entry principal holder', () => {
  it('issues the entry principal of the target tenant, verified by the same authority', async () => {
    const { issuer, verifier } = inProcessPrincipalAuthority()
    const principal = await issued(issuer)
    expect(principal).toMatchObject({
      kind: 'acting-for-tenant',
      actor: { kind: 'system', component: HITL_ENTRY_COMPONENT },
      tenant: tenantA,
      work: HITL_ENTRY_WORK,
    })
    expect(HITL_ENTRY_COMPONENT).toBe('server-entry')
    expect(HITL_ENTRY_WORK).toEqual({ owner: 'harness.hitl', work: 'cards' })
    expect(await verifier.verify(principal)).toEqual({ kind: 'verified', principal })
  })

  it('gives every issuance of one tenant the same reference, and another tenant another one', async () => {
    const { issuer } = inProcessPrincipalAuthority()
    const first = standingPrincipalRef(await issued(issuer))
    const second = standingPrincipalRef(await issued(issuer))
    expect(second).toBe(first)
    expect(hitlEntryRef(tenantA)).toBe(first)
    expect(standingPrincipalRef(await issued(issuer, tenantB))).not.toBe(first)
    expect(hitlEntryRef(tenantB)).not.toBe(first)
  })

  it('refuses when the account is not the account of the target tenant, and issues nothing', async () => {
    const calls: string[] = []
    const { issuer } = inProcessPrincipalAuthority()
    const counted: PrincipalIssuer = {
      issueSystem: input => {
        calls.push('system')
        return issuer.issueSystem(input)
      },
      issueActingForTenant: input => {
        calls.push('acting')
        return issuer.issueActingForTenant(input)
      },
    }
    const answer = await createHitlEntryPrincipals(counted).issue({
      account: tenantB.account,
      tenant: tenantA,
    })
    expect(answer).toEqual({ kind: 'refused' })
    expect(calls).toEqual([])
  })

  it('refuses when the authority refuses the principal', async () => {
    const { issuer } = inProcessPrincipalAuthority()
    const refusing: PrincipalIssuer = {
      issueSystem: input => issuer.issueSystem(input),
      issueActingForTenant: () => ({ failure: { field: 'tenant', reason: 'unminted' } }),
    }
    expect(
      await createHitlEntryPrincipals(refusing).issue({
        account: tenantA.account,
        tenant: tenantA,
      }),
    ).toEqual({ kind: 'refused' })
    const noActor: PrincipalIssuer = {
      issueSystem: () => ({ failure: { field: 'component', reason: 'empty' } }),
      issueActingForTenant: input => issuer.issueActingForTenant(input),
    }
    expect(
      await createHitlEntryPrincipals(noActor).issue({ account: tenantA.account, tenant: tenantA }),
    ).toEqual({ kind: 'refused' })
  })
})

describe('the audience of HITL cards', () => {
  const origin = (kind: 'tool' | 'agent-extension'): Origin =>
    OriginSchema.parse({
      kind,
      originRef: 'o',
      wait: { owner: 'tool', waitId: 'w', incarnation: '1', destination: 'harness.hitl' },
      positionRef: 'p',
      adoptionRef: 'a',
      sessionRef: 's',
      runRef: 'r',
      ...(kind === 'tool' ? { toolCallRef: 'c' } : {}),
    })

  it('names the entry principal of the tenant as the only reader and the only responder', () => {
    expect(hitlCardAudience({ tenant: tenantA, origin: origin('tool') })).toEqual({
      readers: [hitlEntryRef(tenantA)],
      responders: [hitlEntryRef(tenantA)],
    })
  })

  it('is one rule for every kind of origin, and differs only by tenant', () => {
    expect(hitlCardAudience({ tenant: tenantA, origin: origin('agent-extension') })).toEqual(
      hitlCardAudience({ tenant: tenantA, origin: origin('tool') }),
    )
    expect(hitlCardAudience({ tenant: tenantB, origin: origin('tool') }).readers).toEqual([
      hitlEntryRef(tenantB),
    ])
  })
})
