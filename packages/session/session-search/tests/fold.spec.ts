import { describe, expect, it } from 'vitest'
import { foldText } from '../src/index.ts'

function everyPoint(): string[] {
  const points: string[] = []
  for (let code = 1; code <= 0x1ffff; code += 1)
    if (code < 0xd800 || code > 0xdfff) points.push(String.fromCodePoint(code))
  return points
}

describe('the case fold of the index', () => {
  it('folds ASCII and leaves the rest of plain text as it is', () => {
    expect(foldText('Hello, WORLD 123')).toBe('hello, world 123')
    expect(foldText('受理 预算')).toBe('受理 预算')
    expect(foldText('')).toBe('')
    const plain = 'no upper case here'
    expect(foldText(plain)).toBe(plain)
  })

  it('never changes the length, so a position in folded text is a position in the text', () => {
    for (const point of everyPoint()) expect(foldText(point).length).toBe(point.length)
    expect(foldText('aİb😀ẞc')).toHaveLength('aİb😀ẞc'.length)
  })

  it('folds what is folded already to itself', () => {
    for (const point of everyPoint()) {
      const folded = foldText(point)
      if (foldText(folded) !== folded) throw new Error(`U+${point.codePointAt(0)!.toString(16)}`)
    }
  })

  it('lands the members of a case orbit on one value: s, S and the long s; the three sigmas', () => {
    expect(new Set(['s', 'S', 'ſ'].map(foldText))).toEqual(new Set(['s']))
    expect(new Set(['σ', 'Σ', 'ς'].map(foldText))).toEqual(new Set(['σ']))
    expect(new Set(['k', 'K', 'K'].map(foldText))).toEqual(new Set(['k']))
  })
})
