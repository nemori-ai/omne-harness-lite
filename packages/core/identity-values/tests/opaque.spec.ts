import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  IDENTITY_BRAND_NAMES,
  IDENTITY_TYPE_NAMES,
  OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS,
  parseAccountId,
  validate,
} from '../src/index.ts'
import { SPEC_DIR } from './spec-fixtures.ts'

describe('S-31：唯一公开空白码点集合', () => {
  it('与已接受正文的显式码点表相同', () => {
    const contract = readFileSync(resolve(SPEC_DIR, 'contract.md'), 'utf8')
    const section = contract.split('**「空白」恰是下列码点，逐个列出：**')[1]?.split('**首字符')[0]
    expect(section).toBeDefined()
    const expected = Array.from(
      section?.matchAll(/U\+([0-9A-F]{4})(?: – U\+([0-9A-F]{4}))?/g) ?? [],
    ).flatMap(match => {
      const first = Number.parseInt(match[1] ?? '', 16)
      const last = match[2] === undefined ? first : Number.parseInt(match[2], 16)
      return Array.from({ length: last - first + 1 }, (_, index) => first + index)
    })
    expect(expected).toHaveLength(26)
    expect(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS).toEqual(expected)
  })

  it('每个码点在首尾均被解析器和 Schema 拒绝，中间保留原样', () => {
    for (const point of OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS) {
      const whitespace = String.fromCodePoint(point)
      for (const value of [`${whitespace}acc`, `acc${whitespace}`]) {
        expect(parseAccountId(value)).toHaveProperty('invalidInput')
        expect(validate('AccountId', value).valid).toBe(false)
      }
      const value = `acc${whitespace}id`
      expect(parseAccountId(value)).toEqual({ ok: value })
      expect(validate('AccountId', value).valid).toBe(true)
    }
  })

  it('运行时也不能修改集合或改变解析事实', () => {
    expect(Object.isFrozen(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS)).toBe(true)
    expect(Reflect.set(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS, '0', 0x0061)).toBe(false)
    expect(Reflect.set(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS, 'length', 0)).toBe(false)
    expect(Reflect.deleteProperty(OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS, '0')).toBe(false)
    expect(parseAccountId('\tacc')).toHaveProperty('invalidInput')
    expect(parseAccountId('acc')).toEqual({ ok: 'acc' })
  })
})

describe('静态检查输入：现有身份类型清单', () => {
  it('品牌与结构身份分开列出，不把属性或凭证当身份', () => {
    expect(IDENTITY_BRAND_NAMES).toEqual(['AccountId', 'OrganizationId', 'LoginStateId'])
    expect(IDENTITY_TYPE_NAMES).toEqual([...IDENTITY_BRAND_NAMES, 'TenantId', 'ScopeLayerIdentity'])
    expect(Object.isFrozen(IDENTITY_BRAND_NAMES)).toBe(true)
    expect(Object.isFrozen(IDENTITY_TYPE_NAMES)).toBe(true)
    for (const name of IDENTITY_TYPE_NAMES) expect(() => validate(name, null)).not.toThrow()
  })
})
