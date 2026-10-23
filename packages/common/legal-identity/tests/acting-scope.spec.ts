import { describe, expect, it } from 'vitest'
import {
  actingScopeCodec,
  actingScopeEquals,
  systemScope,
  tenantCodec,
  tenantScope,
  type ActingScope,
  type TenantId,
} from '@omne-harness/legal-identity'

const TENANT_TEXT =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'
const OTHER_TENANT_TEXT =
  '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2346"}'
const TENANT_SCOPE_TEXT = `{"kind":"tenant","tenant":${TENANT_TEXT}}`
const SYSTEM_SCOPE_TEXT = '{"kind":"system"}'

function parsedTenant(text: string): TenantId {
  const result = tenantCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

function parsedScope(text: string): ActingScope {
  const result = actingScopeCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

describe('tenantScope() and systemScope()', () => {
  it('builds a frozen tenant scope from a parsed tenant and encodes it', () => {
    const scope = tenantScope(parsedTenant(TENANT_TEXT))
    expect(scope).toEqual({ kind: 'tenant', tenant: parsedTenant(TENANT_TEXT) })
    expect(Object.isFrozen(scope)).toBe(true)
    expect(actingScopeCodec.encode(scope)).toEqual({ ok: true, value: TENANT_SCOPE_TEXT })
  })

  it('throws TypeError for a hand-built tenant', () => {
    const forged: TenantId = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: 'org_abcdefghjkmnpqrstvwxyz2345' },
      account: { name: 'AccountId', text: 'acc_abcdefghjkmnpqrstvwxyz2345' },
    }
    expect(() => tenantScope(forged)).toThrow(
      new TypeError('tenantScope() accepts only a TenantId returned by parse or tenant()'),
    )
  })

  it('gives a frozen system scope without any tenant member and encodes it', () => {
    const scope = systemScope()
    expect(scope).toEqual({ kind: 'system' })
    expect(Object.isFrozen(scope)).toBe(true)
    expect(Object.keys(scope)).toEqual(['kind'])
    expect(actingScopeCodec.encode(scope)).toEqual({ ok: true, value: SYSTEM_SCOPE_TEXT })
  })
})

describe('acting scope text codec', () => {
  it('parses both forms', () => {
    expect(actingScopeCodec.parse(SYSTEM_SCOPE_TEXT)).toEqual({
      ok: true,
      value: { kind: 'system' },
    })
    expect(actingScopeCodec.parse(TENANT_SCOPE_TEXT)).toEqual({
      ok: true,
      value: { kind: 'tenant', tenant: parsedTenant(TENANT_TEXT) },
    })
  })

  it.each([
    ['a kind that is not tenant or system', '{"kind":"organization"}', 'family'],
    ['an empty tenant kind', '{"kind":""}', 'family'],
    ['a missing kind', `{"tenant":${TENANT_TEXT}}`, 'missing-member'],
    ['a tenant kind without a tenant', '{"kind":"tenant"}', 'missing-member'],
    [
      'a system kind with a tenant member',
      `{"kind":"system","tenant":${TENANT_TEXT}}`,
      'extra-member',
    ],
    [
      'a tenant kind with a role member',
      `{"kind":"tenant","tenant":${TENANT_TEXT},"role":"x"}`,
      'extra-member',
    ],
    ['a tenant that is not an object', '{"kind":"tenant","tenant":"acc_x"}', 'type'],
    [
      'a tenant with a missing account',
      '{"kind":"tenant","tenant":{"organization":"org_abcdefghjkmnpqrstvwxyz2345"}}',
      'missing-member',
    ],
    ['text that is not JSON', 'system', 'type'],
    ['an array', '[]', 'type'],
  ])('rejects %s with %s', (_case, text, code) => {
    expect(actingScopeCodec.parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code },
    })
  })

  it('refuses to encode a hand-built scope or a minted value of another family', () => {
    const forged: ActingScope = { kind: 'system' }
    expect(actingScopeCodec.encode(forged)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'type' },
    })
    // A parsed tenant is minted, but it is not a scope: encode refuses it instead of reading it.
    const tenantAsScope = parsedTenant(TENANT_TEXT) as unknown as ActingScope
    expect(actingScopeCodec.encode(tenantAsScope)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'type' },
    })
    expect(actingScopeEquals(tenantAsScope, systemScope())).toBe(false)
  })
})

describe('actingScopeEquals()', () => {
  it('compares by kind and tenant value', () => {
    const tenant = tenantScope(parsedTenant(TENANT_TEXT))
    const sameTenant = parsedScope(TENANT_SCOPE_TEXT)
    const otherTenant = tenantScope(parsedTenant(OTHER_TENANT_TEXT))
    expect(tenant).not.toBe(sameTenant)
    expect(actingScopeEquals(tenant, sameTenant)).toBe(true)
    expect(actingScopeEquals(tenant, otherTenant)).toBe(false)
    expect(actingScopeEquals(systemScope(), parsedScope(SYSTEM_SCOPE_TEXT))).toBe(true)
    expect(actingScopeEquals(systemScope(), tenant)).toBe(false)
    expect(actingScopeEquals(tenant, systemScope())).toBe(false)
  })

  it('is false for a hand-built scope on either side', () => {
    const forged: ActingScope = { kind: 'system' }
    expect(actingScopeEquals(forged, systemScope())).toBe(false)
    expect(actingScopeEquals(systemScope(), forged)).toBe(false)
    expect(actingScopeEquals(forged, forged)).toBe(false)
  })
})
