import { describe, expect, it } from 'vitest'
import { formatNumberedLines } from '@omne-harness/unix-format'

describe('formatNumberedLines', () => {
  it('renders nothing for no lines', () => {
    expect(formatNumberedLines([])).toBe('')
  })

  it('right-aligns numbers in a six-column gutter by default', () => {
    expect(formatNumberedLines(['alpha', 'beta'])).toBe('     1 | alpha\n     2 | beta')
  })

  it('numbers from the caller-supplied start', () => {
    expect(formatNumberedLines(['eight', 'nine'], { start: 8 })).toBe(
      '     8 | eight\n     9 | nine',
    )
  })

  it('widens the gutter past six columns when the last number needs it', () => {
    expect(formatNumberedLines(['a', 'b'], { start: 999_999 })).toBe(' 999999 | a\n1000000 | b')
  })

  it('computes the gutter width from the last number, not the first', () => {
    expect(formatNumberedLines(['a', 'b'], { start: 9_999_999 }).split('\n')).toEqual([
      ' 9999999 | a',
      '10000000 | b',
    ])
  })

  it('accepts a different separator', () => {
    expect(formatNumberedLines(['alpha'], { separator: ':' })).toBe('     1 : alpha')
  })

  it('truncates an overlong line with a visible marker', () => {
    expect(formatNumberedLines(['x'.repeat(40), 'short'], { perLineCharLimit: 10 })).toBe(
      `     1 | ${'x'.repeat(10)} [truncated]\n     2 | short`,
    )
  })

  it('keeps a truncated line as one numbered line', () => {
    const numbers = formatNumberedLines(['y'.repeat(50), 'z'.repeat(50)], { perLineCharLimit: 5 })
      .split('\n')
      .map(line => line.split('|', 1)[0]?.trim())
    expect(numbers).toEqual(['1', '2'])
  })

  it('does not mark a line exactly at the limit', () => {
    expect(formatNumberedLines(['12345'], { perLineCharLimit: 5 })).toBe('     1 | 12345')
  })

  it('caps the whole rendered line at maxWidth', () => {
    const rendered = formatNumberedLines(['x'.repeat(40)], { maxWidth: 20 })
    expect(rendered).toHaveLength(20)
    expect(rendered.startsWith('     1 | ')).toBe(true)
  })

  it('caps nothing with maxWidth 0 or by default', () => {
    expect(formatNumberedLines(['x'.repeat(40)], { maxWidth: 0 })).toBe(
      `     1 | ${'x'.repeat(40)}`,
    )
    expect(formatNumberedLines(['x'.repeat(200)])).toBe(`     1 | ${'x'.repeat(200)}`)
  })

  it('counts limits by code point', () => {
    expect(formatNumberedLines(['😀😀😀'], { perLineCharLimit: 2 })).toBe(
      '     1 | 😀😀 [truncated]',
    )
  })

  it('rejects a fractional start and negative limits', () => {
    expect(() => formatNumberedLines(['a'], { start: 1.5 })).toThrow(RangeError)
    expect(() => formatNumberedLines(['a'], { perLineCharLimit: -1 })).toThrow(RangeError)
    expect(() => formatNumberedLines(['a'], { maxWidth: -1 })).toThrow(RangeError)
  })
})
