import { describe, expect, it } from 'vitest'
import schema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import { judgeContentBlock, validate } from '@omne-harness-lite/content-blocks'
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import { schemaPattern } from '../src/schema-pattern.ts'

const pattern = schema.$defs.InlineBytes.pattern
const original = new RegExp(pattern, 'u')
const compiled = createSchemaRuntime([schema]).compile({
  $ref: `${schema.$id}#/$defs/InlineBytes`,
})
function image(inline: string) {
  return {
    id: 'image',
    kind: 'image',
    visibility: { toHuman: true, toModel: true },
    mediaType: 'image/png',
    data: { inline },
  }
}

describe('InlineBytes frozen language without input-sized RegExp stack', () => {
  it('matches the original language exhaustively across representative character classes', () => {
    const optimized = schemaPattern(pattern, 'u')
    // This also catches a frozen Schema change silently disabling the optimization.
    expect(optimized).not.toBeInstanceOf(RegExp)
    let checked = 0
    function compare(value: string, remaining: number) {
      if (optimized.test(value) !== original.test(value))
        throw new Error(`different InlineBytes language at ${JSON.stringify(value)}`)
      checked++
      if (remaining > 0)
        for (const character of ['A', '/', '=', '\n', '_', 'é'])
          compare(value + character, remaining - 1)
    }
    compare('', 7)
    expect(checked).toBe(335923)
  })

  it.each([
    '',
    'AAAA',
    'AAA=',
    'AA==',
    'AB==',
    'AAB=',
    '====',
    'AAA',
    'A===',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    'AAAA\n',
    'AAAA\r\n',
    'AAAA\u2028',
    'AAAA\u2029',
    'AAAA\0',
    'AAAA😀',
    'ＡＡＡＡ',
    '\ud800AAA',
    '=AAA',
    'AA=A',
    'AAAA====',
  ])('preserves exact padding and strict ending for %j', value => {
    const expected = original.test(value)
    expect(validate('InlineBytes', value).valid).toBe(expected)
    expect(compiled.validate(value)).toBe(expected)
    expect('ok' in judgeContentBlock(image(value))).toBe(expected)
  })

  it.each([4 * 1024 * 1024, 4 * 1024 * 1024 + 1])(
    'accepts %i decoded bytes and rejects malformed long strings without throwing',
    bytes => {
      const value = Buffer.alloc(bytes).toString('base64')
      expect(validate('InlineBytes', value).valid).toBe(true)
      expect(compiled.validate(value)).toBe(true)
      expect('ok' in judgeContentBlock(image(value))).toBe(true)
      for (const invalid of [value.slice(0, -1) + '!', value + '\n', '=' + value.slice(1)]) {
        expect(validate('InlineBytes', invalid).valid).toBe(false)
        expect(compiled.validate(invalid)).toBe(false)
        expect(judgeContentBlock(image(invalid))).toEqual({ rejected: 'malformed' })
      }
    },
  )

  it('keeps other patterns and caller factories authoritative', () => {
    expect(schemaPattern('^x$', 'u')).toBeInstanceOf(RegExp)
    expect(schemaPattern('^x$', 'u').test('x')).toBe(true)
    expect(schemaPattern('^x$', 'u').test('x\n')).toBe(false)
    expect(schemaPattern('^x$', 'm').test('x\n')).toBe(true)
    const seen: string[] = []
    const custom = createSchemaRuntime([], {
      patternFactory(source) {
        seen.push(source)
        return /^chosen$/
      },
    }).compile({ type: 'string', pattern })
    expect(seen).toContain(pattern)
    expect(custom.validate('chosen')).toBe(true)
    expect(custom.validate('AAAA')).toBe(false)
    for (const flags of ['g', 'y'])
      expect(() =>
        createSchemaRuntime([], {
          patternFactory: source => new RegExp(source, flags),
        }).compile({ pattern }),
      ).toThrow(TypeError)
  })
})
