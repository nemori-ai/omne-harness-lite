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
      expect(foldText(folded), `U+${point.codePointAt(0)!.toString(16)}`).toBe(folded)
    }
  })

  it('lands the members of a case orbit on one value: s, S and the long s; the three sigmas', () => {
    expect(new Set(['s', 'S', 'ſ'].map(foldText))).toEqual(new Set(['s']))
    expect(new Set(['σ', 'Σ', 'ς'].map(foldText))).toEqual(new Set(['σ']))
    expect(new Set(['k', 'K', 'K'].map(foldText))).toEqual(new Set(['k']))
  })
  it('folds a code point in the middle of a text and keeps what stands around it', () => {
    expect(foldText('a\u00c9b\ud83d\ude00C')).toBe('a\u00e9b\ud83d\ude00c')
    expect(foldText('\ud83d\ude00\u00c9')).toBe('\ud83d\ude00\u00e9')
    expect(foldText('@AZ[`az{')).toBe('@az[`az{')
    expect(foldText('\u007f\u0080\u00c0')).toBe('\u007f\u0080\u00e0')
    expect(foldText('\ud801\udc00')).toBe('\ud801\udc28')
    expect(foldText('x\uffff\u00c9')).toBe('x\uffff\u00e9')
  })

  it('keeps a code point whose upper or lower case is longer than itself', () => {
    expect(foldText('\u00df')).toBe('\u00df')
    expect(foldText('\u0130')).toBe('\u0130')
    expect(foldText('\u1e9e')).toBe('\u00df')
  })

  it('folds alike the three pairs whose upper case is more than one code point', () => {
    expect(foldText('\u1fd3')).toBe('\u0390')
    expect(foldText('\u0390')).toBe('\u0390')
    expect(foldText('\u1fe3')).toBe('\u03b0')
    expect(foldText('\ufb05')).toBe('\ufb06')
    expect(foldText('a\u1fd3b\ufb05')).toBe('a\u0390b\ufb06')
  })

  it('gives the same value the second time it folds a code point', () => {
    expect(foldText('\u00c9')).toBe(foldText('\u00c9'))
    expect(foldText('\u03a3\u03a3')).toBe('\u03c3\u03c3')
  })
})
