import { describe, expect, it } from 'vitest'
import {
  IDENTITY_BRAND_NAMES,
  IDENTITY_TYPE_NAMES,
  OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS,
  parseAccountId,
  validate,
} from '../src/index.ts'

describe('S-31：唯一公开空白码点集合', () => {
  it('与已接受正文的显式码点表相同', () => {
    // Fixed adopted input, independent of the exported set and parser.
    const expected = [
      0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680, 0x2000, 0x2001,
      0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029,
      0x202f, 0x205f, 0x3000, 0xfeff,
    ]
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
