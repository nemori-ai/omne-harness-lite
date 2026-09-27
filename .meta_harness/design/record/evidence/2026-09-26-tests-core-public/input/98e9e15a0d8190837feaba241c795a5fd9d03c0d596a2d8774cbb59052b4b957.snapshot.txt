import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type Parsed,
  SCHEMA_DEF_NAMES,
  parseAccountId,
  parseHandoffWarrant,
  parseLoginIdentifier,
  parseLoginStateId,
  parseMembershipStanding,
  parseMembershipStandingResult,
  parseOrganizationId,
  parseOrganizationKind,
  parseScopeLayerIdentity,
  parseTenantId,
  parseTenantRole,
  validate,
} from '../src/index.ts'
import { SPEC_DIR, loadExampleRows } from './spec-fixtures.ts'

describe('Schema 副本', () => {
  it('与 spec 目录的规范工件逐字节相同', () => {
    const original = readFileSync(resolve(SPEC_DIR, 'identity-values.schema.json'))
    const copy = readFileSync(resolve(import.meta.dirname, '../schema/identity-values.schema.json'))
    expect(copy.equals(original)).toBe(true)
  })

  it('十二个定义项都能取到校验器', () => {
    for (const name of SCHEMA_DEF_NAMES) {
      expect(() => validate(name, 'x')).not.toThrow()
    }
  })
})

const parsers: Partial<Record<string, (value: unknown) => Parsed<unknown>>> = {
  AccountId: parseAccountId,
  OrganizationId: parseOrganizationId,
  LoginStateId: parseLoginStateId,
  LoginIdentifier: parseLoginIdentifier,
  OrganizationKind: parseOrganizationKind,
  TenantRole: parseTenantRole,
  TenantId: parseTenantId,
  MembershipStanding: parseMembershipStanding,
  MembershipStandingResult: parseMembershipStandingResult,
  ScopeLayerIdentity: parseScopeLayerIdentity,
  HandoffWarrant: parseHandoffWarrant,
}

describe('V-1：examples.md 第 1～11 节的正反实例', () => {
  const rows = loadExampleRows()

  it('参与机检的行数与契约验证入口登记的一致（86）', () => {
    expect(rows.length).toBe(86)
  })

  for (const row of rows) {
    const label = `${row.section} L${row.line} ${row.instanceText} ⇒ ${row.expected}`
    it(`Schema：${label}`, () => {
      const result = validate(row.defName as (typeof SCHEMA_DEF_NAMES)[number], row.instance)
      expect(result.valid).toBe(row.expected === 'pass')
    })
    it(`解析入口与 Schema 同判：${label}`, () => {
      const parser = parsers[row.defName]
      expect(parser).toBeDefined()
      const parsed = parser!(row.instance)
      expect('ok' in parsed).toBe(row.expected === 'pass')
    })
  }
})
