import { describe, expect, it } from 'vitest'
import { tokenize } from '../src/index.ts'

describe('tokenize', () => {
  it('splits identifiers and Chinese runs deterministically', () => {
    expect(tokenize('readFile read_file ＡＢＣ 中文工具')).toEqual([
      'read',
      'file',
      'readfile',
      'read',
      'file',
      'read_file',
      'abc',
      '中',
      '文',
      '工',
      '具',
      '中文',
      '文工',
      '工具',
    ])
  })
  it('keeps the whole word only when the split parts do not already contain it', () => {
    expect(tokenize('report')).toEqual(['report'])
    expect(tokenize('HTTPServer')).toEqual(['http', 'server', 'httpserver'])
    expect(tokenize('__init__')).toEqual(['init', '__init__'])
    expect(tokenize('read__file_')).toEqual(['read', 'file', 'read__file_'])
  })
  it('treats other characters as separators only', () => {
    expect(tokenize('a-b, c.d!')).toEqual(['a', 'b', 'c', 'd'])
    expect(tokenize('  \t ')).toEqual([])
  })
  it('gives a single Chinese character as one token', () => {
    expect(tokenize('周')).toEqual(['周'])
  })
})
