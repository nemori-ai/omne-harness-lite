import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantCodec,
  tenantEquals,
  type AccountId,
  type OrganizationId,
  type TenantId,
} from '@omne-harness/legal-identity'

const ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2345'
const ORGANIZATION_TEXT = 'org_abcdefghjkmnpqrstvwxyz2345'
const TENANT_TEXT =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'

function parsedAccount(text: string): AccountId {
  const result = accountCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

function parsedOrganization(text: string): OrganizationId {
  const result = organizationCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

function parsedTenant(text: string): TenantId {
  const result = tenantCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

describe('tenant()', () => {
  it('combines a parsed organization and a parsed account into frozen plain data', () => {
    const combined = tenant(parsedOrganization(ORGANIZATION_TEXT), parsedAccount(ACCOUNT_TEXT))
    expect(combined).toEqual({
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: ORGANIZATION_TEXT },
      account: { name: 'AccountId', text: ACCOUNT_TEXT },
    })
    expect(Object.isFrozen(combined)).toBe(true)
    expect(tenantCodec.encode(combined)).toEqual({ ok: true, value: TENANT_TEXT })
  })

  it('throws TypeError for a hand-built organization or account', () => {
    const organization = parsedOrganization(ORGANIZATION_TEXT)
    const account = parsedAccount(ACCOUNT_TEXT)
    expect(tenant(organization, account).name).toBe('TenantId')
    expect(() => tenant({ name: 'OrganizationId', text: ORGANIZATION_TEXT }, account)).toThrow(
      TypeError,
    )
    expect(() => tenant(organization, { name: 'AccountId', text: ACCOUNT_TEXT })).toThrow(TypeError)
  })

  it('throws TypeError when the parsed halves are swapped', () => {
    const organization = parsedOrganization(ORGANIZATION_TEXT)
    const account = parsedAccount(ACCOUNT_TEXT)
    expect(tenant(organization, account).name).toBe('TenantId')
    expect(() => tenant(account as unknown as OrganizationId, organization as never)).toThrow(
      TypeError,
    )
  })
})

describe('tenant text codec', () => {
  it('parses either key order and encodes organization before account', () => {
    const reordered =
      '{"account":"acc_abcdefghjkmnpqrstvwxyz2345","organization":"org_abcdefghjkmnpqrstvwxyz2345"}'
    const parsed = tenantCodec.parse(reordered)
    expect(parsed).toEqual({
      ok: true,
      value: {
        name: 'TenantId',
        organization: { name: 'OrganizationId', text: ORGANIZATION_TEXT },
        account: { name: 'AccountId', text: ACCOUNT_TEXT },
      },
    })
    if (!parsed.ok) return
    expect(Object.isFrozen(parsed.value)).toBe(true)
    expect(tenantCodec.encode(parsed.value)).toEqual({ ok: true, value: TENANT_TEXT })
  })

  it.each([
    [
      'an extra role',
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345","role":"member"}',
      'extra-member',
    ],
    ['a missing organization', '{"account":"acc_abcdefghjkmnpqrstvwxyz2345"}', 'missing-member'],
    ['a missing account', '{"organization":"org_abcdefghjkmnpqrstvwxyz2345"}', 'missing-member'],
    [
      'a missing account next to a role',
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","role":"member"}',
      'missing-member',
    ],
    ['an empty object', '{}', 'missing-member'],
    ['text that is not JSON', '{"organization":', 'type'],
    ['null', 'null', 'type'],
    ['an array', '["org_abcdefghjkmnpqrstvwxyz2345","acc_abcdefghjkmnpqrstvwxyz2345"]', 'type'],
    ['a JSON string', '"org_abcdefghjkmnpqrstvwxyz2345"', 'type'],
    [
      'an account text in the organization member',
      '{"organization":"acc_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}',
      'family',
    ],
    [
      'a number in the account member',
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":42}',
      'type',
    ],
    [
      'padding inside the account member',
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":" acc_abcdefghjkmnpqrstvwxyz2345"}',
      'whitespace',
    ],
  ])('rejects %s', (_case, text, code) => {
    expect(tenantCodec.parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code },
    })
  })

  it('rejects a non-string input with type instead of coercing it to text', () => {
    expect(tenantCodec.parse([TENANT_TEXT] as never)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'type' },
    })
  })

  it('compares two parses of one tenant text by value', () => {
    const first = parsedTenant(TENANT_TEXT)
    const again = parsedTenant(TENANT_TEXT)
    const combined = tenant(parsedOrganization(ORGANIZATION_TEXT), parsedAccount(ACCOUNT_TEXT))
    const otherAccount = parsedTenant(
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2346"}',
    )
    const otherOrganization = parsedTenant(
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2346","account":"acc_abcdefghjkmnpqrstvwxyz2345"}',
    )
    expect(first).not.toBe(again)
    expect(tenantEquals(first, again)).toBe(true)
    expect(tenantEquals(first, combined)).toBe(true)
    expect(tenantEquals(first, otherAccount)).toBe(false)
    expect(tenantEquals(first, otherOrganization)).toBe(false)
  })

  it('refuses to encode or compare a hand-built tenant made of parsed halves', () => {
    const forged: TenantId = {
      name: 'TenantId',
      organization: parsedOrganization(ORGANIZATION_TEXT),
      account: parsedAccount(ACCOUNT_TEXT),
    }
    expect(tenantCodec.encode(forged)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'type' },
    })
    expect(tenantEquals(forged, parsedTenant(TENANT_TEXT))).toBe(false)
    expect(tenantEquals(parsedTenant(TENANT_TEXT), forged)).toBe(false)
  })
})
