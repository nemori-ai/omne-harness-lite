import { describe, expect, it } from 'vitest'
import {
  organizationCodec,
  scopeLayerCodec,
  scopeLayerEquals,
  type OrganizationId,
  type ScopeLayerIdentity,
} from '@omne-harness/legal-identity'

const ORGANIZATION_TEXT = 'org_abcdefghjkmnpqrstvwxyz2345'
const ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2345'
const ORGANIZATION_LAYER_TEXT =
  '{"layer":"organization","organization":"org_abcdefghjkmnpqrstvwxyz2345"}'
const TENANT_LAYER_TEXT =
  '{"layer":"tenant","tenant":{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}}'

function parsedOrganization(text: string): OrganizationId {
  const result = organizationCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

function parsedLayer(text: string): ScopeLayerIdentity {
  const result = scopeLayerCodec.parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

describe('scope layer codec', () => {
  it('parses an organization layer into frozen plain data and encodes the same text', () => {
    const parsed = scopeLayerCodec.parse(ORGANIZATION_LAYER_TEXT)
    expect(parsed).toEqual({
      ok: true,
      value: {
        name: 'ScopeLayerIdentity',
        layer: 'organization',
        organization: { name: 'OrganizationId', text: ORGANIZATION_TEXT },
      },
    })
    if (!parsed.ok) return
    expect(Object.isFrozen(parsed.value)).toBe(true)
    expect(scopeLayerCodec.encode(parsed.value)).toEqual({
      ok: true,
      value: ORGANIZATION_LAYER_TEXT,
    })
  })

  it('parses a tenant layer into frozen plain data and encodes the same text', () => {
    const parsed = scopeLayerCodec.parse(
      '{"tenant":{"account":"acc_abcdefghjkmnpqrstvwxyz2345","organization":"org_abcdefghjkmnpqrstvwxyz2345"},"layer":"tenant"}',
    )
    expect(parsed).toEqual({
      ok: true,
      value: {
        name: 'ScopeLayerIdentity',
        layer: 'tenant',
        tenant: {
          name: 'TenantId',
          organization: { name: 'OrganizationId', text: ORGANIZATION_TEXT },
          account: { name: 'AccountId', text: ACCOUNT_TEXT },
        },
      },
    })
    if (!parsed.ok) return
    expect(Object.isFrozen(parsed.value)).toBe(true)
    expect(scopeLayerCodec.encode(parsed.value)).toEqual({ ok: true, value: TENANT_LAYER_TEXT })
  })

  it.each([
    ['a session layer', '{"layer":"session","session":"lgn_abcdefghjkmnpqrstvwxyz2345"}'],
    ['a workspace layer', '{"layer":"workspace","workspace":"abcdefghjkmnpqrstvwxyz2345"}'],
    [
      'a workspace layer with a legal workspace text',
      '{"layer":"workspace","workspace":"wsp_abcdefghjkmnpqrstvwxyz2345"}',
    ],
    ['an account layer', '{"layer":"account","account":"acc_abcdefghjkmnpqrstvwxyz2345"}'],
    ['a factory default layer', '{"layer":"factoryDefault"}'],
  ])('rejects %s with family', (_case, text) => {
    expect(scopeLayerCodec.parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'family' },
    })
  })

  it.each([
    [
      'a tenant layer whose tenant has a role',
      '{"layer":"tenant","tenant":{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345","role":"member"}}',
      'extra-member',
    ],
    [
      'a tenant layer whose tenant has no account',
      '{"layer":"tenant","tenant":{"organization":"org_abcdefghjkmnpqrstvwxyz2345"}}',
      'missing-member',
    ],
    [
      'a tenant layer whose tenant is a string',
      '{"layer":"tenant","tenant":"org_abcdefghjkmnpqrstvwxyz2345"}',
      'type',
    ],
    [
      'an organization layer with a role',
      '{"layer":"organization","organization":"org_abcdefghjkmnpqrstvwxyz2345","role":"member"}',
      'extra-member',
    ],
    ['an organization layer with no organization', '{"layer":"organization"}', 'missing-member'],
    [
      'an organization layer holding an account text',
      '{"layer":"organization","organization":"acc_abcdefghjkmnpqrstvwxyz2345"}',
      'family',
    ],
    [
      'an object with no layer',
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345"}',
      'missing-member',
    ],
    ['text that is not JSON', '{"layer":', 'type'],
    ['an array', '["organization","org_abcdefghjkmnpqrstvwxyz2345"]', 'type'],
  ])('rejects %s', (_case, text, code) => {
    expect(scopeLayerCodec.parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code },
    })
  })

  it.each([
    ['organization', ORGANIZATION_LAYER_TEXT],
    ['tenant', TENANT_LAYER_TEXT],
  ])('compares two parses of one %s layer by value', (_layer, text) => {
    const first = parsedLayer(text)
    const again = parsedLayer(text)
    expect(first).not.toBe(again)
    expect(scopeLayerEquals(first, again)).toBe(true)
  })

  it('tells layers apart by layer and by member', () => {
    const organizationLayer = parsedLayer(ORGANIZATION_LAYER_TEXT)
    const tenantLayer = parsedLayer(TENANT_LAYER_TEXT)
    const otherOrganization = parsedLayer(
      '{"layer":"organization","organization":"org_abcdefghjkmnpqrstvwxyz2346"}',
    )
    const otherTenant = parsedLayer(
      '{"layer":"tenant","tenant":{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2346"}}',
    )
    expect(scopeLayerEquals(organizationLayer, tenantLayer)).toBe(false)
    expect(scopeLayerEquals(tenantLayer, organizationLayer)).toBe(false)
    expect(scopeLayerEquals(organizationLayer, otherOrganization)).toBe(false)
    expect(scopeLayerEquals(tenantLayer, otherTenant)).toBe(false)
  })

  it('refuses to encode or compare a hand-built layer made of a parsed organization', () => {
    const forged: ScopeLayerIdentity = {
      name: 'ScopeLayerIdentity',
      layer: 'organization',
      organization: parsedOrganization(ORGANIZATION_TEXT),
    }
    expect(scopeLayerCodec.encode(forged)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'type' },
    })
    expect(scopeLayerEquals(forged, parsedLayer(ORGANIZATION_LAYER_TEXT))).toBe(false)
    expect(scopeLayerEquals(parsedLayer(ORGANIZATION_LAYER_TEXT), forged)).toBe(false)
  })
})
