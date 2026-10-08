import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
import { loadExampleRows } from './spec-fixtures.ts'

describe('规范 Schema 身份', () => {
  it('保留已采用的规范字节', () => {
    const bytes = readFileSync(
      resolve(import.meta.dirname, '../schema/identity-values.schema.json'),
    )
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '1d1f5743c28de3400ecd332072549b6540ca602e553708491caa468267c6a855',
    )
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
