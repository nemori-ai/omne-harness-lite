import { describe, expect, it } from 'vitest'
import { parseCliOptions } from '../src/delivery/cli-options.ts'

const schema = { values: ['--input'], flags: ['--apply'] }

describe('shared CLI options', () => {
  it('keeps string values separate from presence-only flags', () => {
    const parsed = parseCliOptions(['--input', '-draft file', '--apply'], schema, 'usage')
    expect([...parsed.values]).toEqual([['--input', '-draft file']])
    expect([...parsed.flags]).toEqual(['--apply'])
    expect(parsed.positional).toEqual([])
    expect(parseCliOptions([], schema, 'usage').flags.has('--apply')).toBe(false)
  })

  it.each([
    ['--input'],
    ['--input', '--apply'],
    ['--input', '--'],
    ['--input', 'a', '--input', 'b'],
    ['--apply', '--apply'],
    ['--apply=false'],
    ['--apply', 'false'],
    ['--unknown'],
    ['--input=value'],
    ['--', '--apply'],
  ])('rejects ambiguous or unsupported arguments %j', (...args) => {
    expect(() => parseCliOptions(args, schema, 'usage')).toThrow('usage')
  })

  it('retains positional order and treats arguments after -- as literal values', () => {
    const parsed = parseCliOptions(
      ['one', '--input', 'file', 'two', '--', '--apply', '--', 'three'],
      { ...schema, positional: true },
      'usage',
    )
    expect(parsed.positional).toEqual(['one', 'two', '--apply', '--', 'three'])
    expect([...parsed.flags]).toEqual([])
    expect([...parsed.values]).toEqual([['--input', 'file']])
  })

  it('allows a final separator without inventing a positional argument', () => {
    expect(parseCliOptions(['--'], schema, 'usage').positional).toEqual([])
  })
})
