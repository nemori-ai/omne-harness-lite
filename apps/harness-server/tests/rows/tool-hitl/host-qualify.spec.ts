// HITL 宿主对还没有事务域的租户的读者资格（`rows/tool-hitl/host.ts` 的 `qualify`）：与 HITL local 的身份资格判断同一
// 条规则。主体由真实的进程内签发者签发与核验，租户的成员资格是替身。存储与目录在这条路径上不被读取。
import { describe, expect, it } from 'vitest'
import { inProcessPrincipalAuthority, type TenantStandingSource } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { createToolHitlHost } from '../../../src/rows/tool-hitl/host.ts'
import { fixtureTenant } from '../../entry/support.ts'

const authority = inProcessPrincipalAuthority()
const textOf = (tenant: TenantId) => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant')
  return text.value
}
const entryOf = (tenant: TenantId) => {
  const actor = authority.issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in actor) throw new Error('actor')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: 'harness.hitl', work: 'cards' },
  })
  if ('failure' in issued) throw new Error('principal')
  return issued.ok
}
const tenant = fixtureTenant('d')

function hostWith(
  standing: TenantStandingSource['read'] | undefined,
  verifier = authority.verifier,
) {
  return createToolHitlHost({
    storage: {} as never,
    domains: {} as never,
    combination: { combinationVersion: 'v', manifestDigest: 'd' },
    verifier: () => verifier,
    standing: () => (standing === undefined ? undefined : { read: standing }),
    reservations: () => undefined,
  })
}

const member = async () =>
  ({ kind: 'member', role: 'member', qualifications: [], evidence: {} }) as never

describe('the reader qualification of a tenant without a domain', () => {
  it('a verified principal of the tenant with standing qualifies', async () => {
    expect(await hostWith(member).qualify(textOf(tenant), entryOf(tenant))).toEqual({
      kind: 'qualified',
    })
  })

  it('a principal of a tenant whose account is not a member is denied', async () => {
    const host = hostWith(async () => ({ kind: 'not-member', evidence: {} }) as never)
    expect(await host.qualify(textOf(tenant), entryOf(tenant))).toEqual({
      kind: 'denied',
      reason: 'qualification',
    })
  })

  it('a principal of another tenant is denied for this tenant', async () => {
    const host = hostWith(member)
    expect(await host.qualify(textOf(tenant), entryOf(fixtureTenant('a')))).toEqual({
      kind: 'denied',
      reason: 'tenant',
    })
  })

  it('a principal that the verifier did not issue is denied', async () => {
    const forged = { ...entryOf(tenant) }
    expect(await hostWith(member).qualify(textOf(tenant), forged)).toEqual({
      kind: 'denied',
      reason: 'principal',
    })
  })

  it('without the standing read, or when it is unavailable, the answer is unavailable', async () => {
    expect(await hostWith(undefined).qualify(textOf(tenant), entryOf(tenant))).toMatchObject({
      kind: 'unavailable',
    })
    const host = hostWith(async () => ({ kind: 'unavailable', diagnostic: 'down' }))
    expect(await host.qualify(textOf(tenant), entryOf(tenant))).toMatchObject({
      kind: 'unavailable',
    })
  })
})
