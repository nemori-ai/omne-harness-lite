import { describe, expect, it } from 'vitest'
import { formatBulletList, formatKeyValue, formatTable } from '@omne-harness-lite/unix-format'

describe('formatTable', () => {
  it('renders header, separator and rows with two-space gaps', () => {
    expect(
      formatTable(
        ['Name', 'Version'],
        [
          ['alpha', '1.0'],
          ['beta', '2.1.3'],
        ],
      ),
    ).toBe(['Name   Version', '-----  -------', 'alpha  1.0    ', 'beta   2.1.3  '].join('\n'))
  })

  it('renders only header and separator without rows', () => {
    expect(formatTable(['Name'], [])).toBe('Name\n----')
  })

  it('renders nothing without headers', () => {
    expect(formatTable([], [])).toBe('')
  })

  it('widens columns to their content', () => {
    expect(formatTable(['X', 'Y'], [['long_value_here', 'short']])).toBe(
      ['X                Y    ', '---------------  -----', 'long_value_here  short'].join('\n'),
    )
  })

  it('rejects rows with the wrong cell count', () => {
    expect(() => formatTable(['A', 'B'], [['x', 'y', 'z']])).toThrow(
      'row 0 has 3 cells, expected 2',
    )
    expect(() => formatTable(['A', 'B'], [['x']])).toThrow('row 0 has 1 cells, expected 2')
  })

  it('shrinks the last column and truncates with an ellipsis', () => {
    expect(
      formatTable(['AAAA', 'BBBB'], [['xxxxxxxxxxxxx', 'yyyyyyyyyyyyy']], { maxWidth: 10 }),
    ).toBe(['AAAA           ...', '-------------  ---', 'xxxxxxxxxxxxx  ...'].join('\n'))
  })

  it('exceeds the cap when the last column cannot shrink further', () => {
    const lines = formatTable(['AAAAA', 'BBBBB', 'CCCCC'], [['xxxxx', 'yyyyy', 'zzzzz']], {
      maxWidth: 10,
    }).split('\n')
    expect(lines).toHaveLength(3)
    expect(Math.max(...lines.map(line => line.length))).toBeGreaterThan(10)
    expect(lines[0]).toMatch(/\.\.\.$/)
  })

  it('caps at 120 by default', () => {
    const out = formatTable(['A', 'B'], [['x'.repeat(100), 'y'.repeat(100)]])
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(120)
    expect(out).toContain('...')
  })

  it('disables the cap with maxWidth 0', () => {
    const long = 'x'.repeat(200)
    expect(formatTable(['A'], [[long]], { maxWidth: 0 })).toBe(
      `A${' '.repeat(199)}\n${'-'.repeat(200)}\n${long}`,
    )
  })

  it('does not truncate content that fits the cap', () => {
    const out = formatTable(['A', 'B'], [['short', 'short']], { maxWidth: 40 })
    for (const line of out.split('\n')) expect(line.length).toBeLessThanOrEqual(40)
    expect(out).not.toContain('...')
  })

  it('measures CJK content by code point', () => {
    expect(
      formatTable(
        ['名称', '版本'],
        [
          ['中文内容', '1.0'],
          ['foo', '贰.零'],
        ],
      ),
    ).toBe(['名称    版本 ', '----  ---', '中文内容  1.0', 'foo   贰.零'].join('\n'))
  })
})

describe('formatKeyValue', () => {
  it('pads keys so the colons align', () => {
    expect(formatKeyValue({ name: 'alpha', version: '1.0' })).toBe('name   : alpha\nversion: 1.0')
  })

  it('keeps Map insertion order', () => {
    expect(
      formatKeyValue(
        new Map([
          ['2', 'b'],
          ['1', 'a'],
        ]),
      ),
    ).toBe('2: b\n1: a')
  })

  it('renders nothing for no pairs', () => {
    expect(formatKeyValue({})).toBe('')
    expect(formatKeyValue(new Map())).toBe('')
  })

  it('tolerates an empty key', () => {
    expect(formatKeyValue({ '': 'value' })).toBe(': value')
  })

  it('passes newlines in values through', () => {
    expect(formatKeyValue({ k: 'line1\nline2' })).toBe('k: line1\nline2')
  })
})

describe('formatBulletList', () => {
  it('prefixes each item with a dash', () => {
    expect(formatBulletList(['one', 'two', 'three'])).toBe('- one\n- two\n- three')
  })

  it('renders nothing for no items', () => {
    expect(formatBulletList([])).toBe('')
  })

  it('passes newlines in items through', () => {
    expect(formatBulletList(['line1\nline2', 'third'])).toBe('- line1\nline2\n- third')
  })
})
