import type { LoginIdentity } from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { goalEntrance } from '../../../src/rows/goal-access/index.ts'

const TEXT = JSON.stringify({
  organization: `org_${'a'.repeat(26)}`,
  account: `acc_${'1'.repeat(26)}`,
})
const tenant = (): TenantId => {
  const parsed = tenantCodec.parse(TEXT)
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const LOGIN = { login: 'erin' } as unknown as LoginIdentity
const PRINCIPAL = Object.freeze({ kind: 'acting-for-tenant' })

function entrance(outcome: 'issued' | 'denied' | 'basis-unavailable') {
  const asked: unknown[] = []
  const acting = async (login: unknown, text: unknown) => {
    asked.push([login, text])
    return outcome === 'issued' ? { outcome, principal: PRINCIPAL } : { outcome }
  }
  return { asked, entrance: goalEntrance(acting as never) }
}

describe('who the goals take a login at the panel for', () => {
  it('the member acting for the tenant, named in the history by the account of that tenant', async () => {
    const { asked, entrance: port } = entrance('issued')
    expect(await port.admit(LOGIN, tenant())).toEqual({
      kind: 'admitted',
      subject: PRINCIPAL,
      by: `acc_${'1'.repeat(26)}`,
    })
    expect(asked).toEqual([[LOGIN, TEXT]])
  })

  it('nobody when the login may not act for the tenant, and no basis when that cannot be told', async () => {
    expect(await entrance('denied').entrance.admit(LOGIN, tenant())).toEqual({ kind: 'denied' })
    expect(await entrance('basis-unavailable').entrance.admit(LOGIN, tenant())).toEqual({
      kind: 'basis-unavailable',
    })
  })
})
