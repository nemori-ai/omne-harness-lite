import { describe, expect, it } from 'vitest'
import {
  ORGANIZATION_KINDS,
  TENANT_ROLES,
  parseMembershipStandingResult,
  parseOrganizationKind,
  parseTenantId,
  sameAccountDistinctTenants,
  tenantIdEquals,
  toCanonicalJson,
  unwrap,
} from '../src/index.ts'

const t = (organization: string, account: string) =>
  unwrap(parseTenantId({ organization, account }))

describe('TenantId（S-5 / S-7）', () => {
  it('相等按分量，成员顺序不参与', () => {
    const a = unwrap(parseTenantId({ organization: 'org_kf22', account: 'acc_7f3c91' }))
    const b = unwrap(parseTenantId({ account: 'acc_7f3c91', organization: 'org_kf22' }))
    expect(tenantIdEquals(a, b)).toBe(true)
  })

  it('逐码点精确相等，不折叠大小写（S-31）', () => {
    expect(tenantIdEquals(t('org_kf22', 'acc_7f3c91'), t('org_kf22', 'ACC_7F3C91'))).toBe(false)
  })

  it('规范序列化形式唯一：键序固定、无多余成员', () => {
    const fromReversed = unwrap(parseTenantId({ account: 'acc_1', organization: 'org_1' }))
    expect(toCanonicalJson(fromReversed)).toBe('{"organization":"org_1","account":"acc_1"}')
  })

  it('两个分量都必需，不得用环境值补齐（S-12）', () => {
    expect('invalidInput' in parseTenantId({ organization: 'org_1' })).toBe(true)
    expect('invalidInput' in parseTenantId({ account: 'acc_1' })).toBe(true)
  })
})

describe('sameAccountDistinctTenants（S-13）', () => {
  it('同一账号、不同组织为真', () => {
    expect(sameAccountDistinctTenants(t('org_a', 'acc_1'), t('org_b', 'acc_1'))).toBe(true)
  })
  it('同一租户为假；不同账号为假', () => {
    expect(sameAccountDistinctTenants(t('org_a', 'acc_1'), t('org_a', 'acc_1'))).toBe(false)
    expect(sameAccountDistinctTenants(t('org_a', 'acc_1'), t('org_b', 'acc_2'))).toBe(false)
  })
})

describe('闭合枚举（S-32）', () => {
  it('取值集合恰为契约所列', () => {
    expect([...ORGANIZATION_KINDS]).toEqual(['personal', 'team'])
    expect([...TENANT_ROLES]).toEqual(['superAdministrator', 'member'])
  })
  it('未知取值拒绝，不映射到最接近的已知值', () => {
    expect('invalidInput' in parseOrganizationKind('Personal')).toBe(true)
    expect('invalidInput' in parseOrganizationKind('individual')).toBe(true)
  })
})

describe('MembershipStandingResult（S-10）', () => {
  it('三种输入分到三个不同形状：效力有效、效力无效、不可用', () => {
    const effective = parseMembershipStandingResult({ standing: 'effective', role: 'member' })
    const ineffective = parseMembershipStandingResult({ standing: 'ineffective' })
    const unavailable = parseMembershipStandingResult({ failure: 'unavailable' })
    expect(effective).toEqual({ ok: { standing: 'effective', role: 'member' } })
    expect(ineffective).toEqual({ ok: { standing: 'ineffective' } })
    expect(unavailable).toEqual({ ok: { failure: 'unavailable' } })
  })
  it('失败不带原因；两支不得同时给', () => {
    expect('invalidInput' in parseMembershipStandingResult({ failure: 'timeout' })).toBe(true)
    expect(
      'invalidInput' in
        parseMembershipStandingResult({ failure: 'unavailable', standing: 'ineffective' }),
    ).toBe(true)
  })
})
