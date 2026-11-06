import { describe, expect, it } from 'vitest'
import { writeJsonText } from '@omne-harness/json-text'
import { canonical, sameJson } from '@omne-harness/mcp-contract'
import { json, jsonText } from './json.ts'

describe('canonical and sameJson', () => {
  it('sorts object members by name at every depth and keeps number lexemes', () => {
    const tree = jsonText('{"b":{"y":1.0,"x":[{"d":2,"c":3}]},"a":null}')
    expect(writeJsonText(canonical(tree))).toBe('{"a":null,"b":{"x":[{"c":3,"d":2}],"y":1.0}}')
  })

  it('treats trees that differ only in member order as the same', () => {
    expect(sameJson(json({ a: 1, b: { c: 2, d: 3 } }), json({ b: { d: 3, c: 2 }, a: 1 }))).toBe(
      true,
    )
  })

  it('tells apart a different value, a different member and a different number lexeme', () => {
    expect(sameJson(json({ a: 1 }), json({ a: 2 }))).toBe(false)
    expect(sameJson(json({ a: 1 }), json({ a: 1, b: 1 }))).toBe(false)
    expect(sameJson(jsonText('{"a":1}'), jsonText('{"a":1.0}'))).toBe(false)
    expect(sameJson(json([1, 2]), json([2, 1]))).toBe(false)
  })
})
