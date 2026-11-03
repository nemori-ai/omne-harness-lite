// `bodyOffsetOf`: where the body of a SKILL.md starts, in bytes, after the line end of the
// closing delimiter; and the delimiter boundaries of the frontmatter through the package rules.
import { describe, expect, it } from 'vitest'
import { bodyOffsetOf } from '@omne-harness/skill-contract'
import { manifestText } from './package-builder.ts'
import { codeOf, parse } from './parse-support.ts'

const encoder = new TextEncoder()
const bytes = (text: string) => encoder.encode(text)

describe('bodyOffsetOf', () => {
  it.each([
    ['LF line ends', '---\nname: x\n---\nBody', 16, 'Body'],
    ['CRLF line ends', '---\r\nname: x\r\n---\r\nBody', 19, 'Body'],
    ['an LF opening and a CRLF closing', '---\nname: x\n---\r\nBody', 17, 'Body'],
    ['a closing delimiter that ends the file without a line end', '---\nname: x\n---', 15, ''],
    ['a closing delimiter that ends the file with a line end', '---\nname: x\n---\n', 16, ''],
    ['a header with a character of three bytes', '---\nname: 中\n---\nB', 18, 'B'],
    [
      'a line that is not exactly --- before the closing line',
      '---\nname: x\n--- \n----\n---\nB',
      26,
      'B',
    ],
    ['an empty frontmatter', '---\n---\nB', 8, 'B'],
  ])('gives the body offset for %s', (_case, text, offset, body) => {
    expect(bodyOffsetOf(bytes(text))).toBe(offset)
    expect(new TextDecoder().decode(bytes(text).subarray(offset))).toBe(body)
  })

  it.each([
    ['no frontmatter', 'Body\n'],
    ['an empty file', ''],
    ['an opening delimiter without a line end', '---'],
    ['an opening delimiter with a trailing space', '--- \nname: x\n---\n'],
    ['a byte order mark before the opening delimiter', '﻿---\nname: x\n---\n'],
    ['no closing delimiter', '---\nname: x\n'],
    ['no closing delimiter and no final line end', '---\nname: x'],
    ['a closing delimiter with a trailing space', '---\nname: x\n--- \n'],
    ['a closing delimiter that ends the file with a lone CR', '---\nname: x\n---\r'],
    ['CR line ends only', '---\rname: x\r---\r'],
    ['a four-dash closing line', '---\nname: x\n----\n'],
  ])('gives undefined for %s', (_case, text) => {
    expect(bodyOffsetOf(bytes(text))).toBeUndefined()
  })

  it('does not decode the bytes: an invalid byte in the body does not change the offset', () => {
    expect(bodyOffsetOf(new Uint8Array([...bytes('---\nname: x\n---\n'), 0xff]))).toBe(16)
  })
})

describe('frontmatter boundaries through the package rules', () => {
  it('reads a CRLF manifest without a carriage return in its fields', () => {
    const text = manifestText(['name: demo', 'description: A demo skill.'], '\r\n')
    const result = parse('demo', { 'SKILL.md': text })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.manifest.description).toBe('A demo skill.')
  })

  it('accepts a closing delimiter that ends the file without a line end', () => {
    expect(codeOf(parse('demo', { 'SKILL.md': '---\nname: demo\ndescription: d\n---' }))).toBe(
      'accepted',
    )
  })

  it('accepts a closing delimiter that ends the file with CRLF', () => {
    expect(
      codeOf(parse('demo', { 'SKILL.md': '---\r\nname: demo\r\ndescription: d\r\n---\r\n' })),
    ).toBe('accepted')
  })

  it.each([
    ['an opening delimiter without a line end', '---'],
    [
      'a closing delimiter that ends the file with a lone CR',
      '---\nname: demo\ndescription: d\n---\r',
    ],
    ['CR line ends only', '---\rname: demo\rdescription: d\r---\r'],
    ['a four-dash closing line', '---\nname: demo\ndescription: d\n----\n'],
    ['a two-dash closing line', '---\nname: demo\ndescription: d\n--\n'],
    ['a closing line with a leading space', '---\nname: demo\ndescription: d\n ---\n'],
  ])('rejects %s as malformed', (_case, text) => {
    expect(codeOf(parse('demo', { 'SKILL.md': text }))).toBe('malformed')
  })

  it('reads the frontmatter up to the first closing line, not a later one', () => {
    const text = '---\nname: demo\ndescription: d\n---\nx-later: 1\n---\n'
    const result = parse('demo', { 'SKILL.md': text })
    if (!('ok' in result)) throw new Error(JSON.stringify(result.failure))
    expect(result.ok.manifest.extra).toEqual({})
  })
})
