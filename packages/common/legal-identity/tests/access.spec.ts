import { describe, expect, it } from 'vitest'
import { access, tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'

const TENANT_TEXT =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'

function parsedTenant(text: string): TenantId {
  const result = tenantCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

describe('access()', () => {
  it('keeps the principal as given next to the parsed tenant, frozen', () => {
    const principal = { kind: 'anything', id: 7 }
    const tenant = parsedTenant(TENANT_TEXT)
    const basis: Access<typeof principal> = access(principal, tenant)
    expect(basis).toEqual({ principal, tenant })
    expect(basis.principal).toBe(principal)
    expect(basis.tenant).toBe(tenant)
    expect(Object.isFrozen(basis)).toBe(true)
  })

  it('throws TypeError for a hand-built tenant and does not judge the principal', () => {
    const forged: TenantId = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: 'org_abcdefghjkmnpqrstvwxyz2345' },
      account: { name: 'AccountId', text: 'acc_abcdefghjkmnpqrstvwxyz2345' },
    }
    expect(() => access('p', forged)).toThrow(TypeError)
    expect(access(null, parsedTenant(TENANT_TEXT)).principal).toBeNull()
  })
})
