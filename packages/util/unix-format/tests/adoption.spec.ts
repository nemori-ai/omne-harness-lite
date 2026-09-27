import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNIX_FORMAT_OPTIONS,
  formatBulletList,
  formatCommandList,
  formatKeyValue,
  formatNumberedLines,
  formatSection,
  formatTable,
  resolveUnixFormatOptions,
} from '@omne-harness-lite/unix-format'

describe('UF-2 and UF-5 exact code-point formatting and caller text', () => {
  it('UF5-CODEPOINT aligns emoji and CJK by code point and emits the em dash', () => {
    expect(
      formatCommandList([
        ['😀', '中', 'one'],
        ['ab', 'xy', 'two'],
      ]),
    ).toBe('  😀   中   — one\n  ab  xy  — two')
    expect(formatTable(['x'], [['😀😀😀']], { maxWidth: 0 })).toBe('x  \n---\n😀😀😀')
  })

  it('UF2-BESTEFFORT leaves wide early columns intact and shrinks only the last', () => {
    expect(formatTable(['LONGER', 'description'], [['abcdef', 'content']], { maxWidth: 5 })).toBe(
      'LONGER  ...\n------  ---\nabcdef  ...',
    )
  })

  it('UF2-ORDER preserves Map insertion and uses record enumeration order', () => {
    expect(
      formatKeyValue(
        new Map([
          ['2', 'second'],
          ['1', 'first'],
        ]),
      ),
    ).toBe('2: second\n1: first')
    expect(formatKeyValue({ '2': 'second', '1': 'first', last: 'tail' })).toBe(
      '1   : first\n2   : second\nlast: tail',
    )
  })

  it('UF5-RAW preserves Unicode, ANSI input, embedded newlines and blank lines', () => {
    expect(formatBulletList(['😀\u001b[31m\n续行'])).toBe('- 😀\u001b[31m\n续行')
    expect(formatSection('标题', 'one\n \n中', { indent: 2 })).toBe('## 标题\n  one\n \n  中')
  })
})

describe('UF-3 signed starts and ordered truncation', () => {
  it('UF3-SIGNED accepts a negative integer and increments the absolute address', () => {
    expect(formatNumberedLines(['zero', 'one', 'two'], { start: -1 })).toBe(
      '    -1 | zero\n     0 | one\n     1 | two',
    )
  })

  it('UF3-TWO-LIMITS cuts content by code point before cutting the entire line', () => {
    expect(formatNumberedLines(['😀ab'], { perLineCharLimit: 1 })).toBe('     1 | 😀 [truncated]')
    expect(formatNumberedLines(['😀ab'], { perLineCharLimit: 1, maxWidth: 11 })).toBe(
      '     1 | 😀 ',
    )
    expect(formatNumberedLines(['😀ab'], { perLineCharLimit: 0, maxWidth: 1 })).toBe(' ')
    expect(formatNumberedLines([''], { start: 0 })).toBe('     0 | ')
  })
})

describe('UF-4 option guards', () => {
  for (const invalid of [
    -1,
    -0.1,
    0.1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    it(`UF4-INVALID-${String(invalid)} rejects invalid widths, indents and content limits`, () => {
      expect(() => resolveUnixFormatOptions({ maxWidth: invalid })).toThrow(RangeError)
      expect(() => resolveUnixFormatOptions({ indent: invalid })).toThrow(RangeError)
      expect(() => formatTable(['a'], [], { maxWidth: invalid })).toThrow(RangeError)
      expect(() => formatSection('a', 'b', { indent: invalid })).toThrow(RangeError)
      expect(() => formatNumberedLines(['a'], { perLineCharLimit: invalid })).toThrow(RangeError)
      expect(() => formatNumberedLines(['a'], { maxWidth: invalid })).toThrow(RangeError)
    })
  }

  it('UF4-DEFAULTS preserves zero limits and freezes the default object', () => {
    expect(DEFAULT_UNIX_FORMAT_OPTIONS).toEqual({
      maxWidth: 120,
      indent: 2,
      markdownCompatible: true,
    })
    expect(Object.isFrozen(DEFAULT_UNIX_FORMAT_OPTIONS)).toBe(true)
    expect(resolveUnixFormatOptions({ maxWidth: 0, indent: 0, markdownCompatible: false })).toEqual(
      {
        maxWidth: 0,
        indent: 0,
        markdownCompatible: false,
      },
    )
  })
})
