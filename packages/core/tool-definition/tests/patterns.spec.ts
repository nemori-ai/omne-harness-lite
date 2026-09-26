import { describe, expect, it } from 'vitest'
import {
  judgeToolDefinition,
  isToolDefinition,
  createParameterJudge,
  PATTERN_MAX_CODE_POINTS,
  PATTERN_MAX_FINITE_COUNT,
} from '../src/index.ts'

function definition(pattern: string) {
  return {
    name: 't',
    description: 'd',
    paradigm: 'single',
    input: {
      type: 'object',
      properties: { q: { type: 'string', description: 'q', pattern } },
      required: ['q'],
    },
    permissions: { execute: { default: 'ask' } },
    origin: { kind: 'authored' },
  }
}
const accepted = [
  '\\-',
  '{',
  '^.$',
  '^\\u{41}$',
  '^\\p{L}$',
  '[\\u{1F600}-\\u{1F64F}]',
  '(a+){0,3}',
  '[+]+',
  '\\\\1',
  '\\1',
  '[\\1]',
  '\\k<name>',
  'a{0,1000}',
  'a{1000}',
  'a{1001,}',
  '(a|aa)+',
  '[a-z]+[a-z]+',
]
const unsupported = [
  ['(a+)+', 'U-3'],
  ['(a*b*)*', 'U-3'],
  ['(a+?)+?', 'U-3'],
  ['(a{1,})*', 'U-3'],
  ['(a)\\1', 'U-4'],
  ['(?<name>a)\\k<name>', 'U-4'],
  ['a{0,1001}', 'U-5'],
  ['a{1001}', 'U-5'],
]
describe('actual U1-U7 pattern compilation and AST limits', () => {
  for (const pattern of accepted)
    it(`accept actual AST ${pattern}`, () =>
      expect(judgeToolDefinition(definition(pattern))).toEqual({ ok: true }))
  for (const [pattern, limit] of unsupported)
    it(`reject ${limit}: ${pattern}`, () => {
      if (pattern === undefined) throw new Error('fixture')
      expect(judgeToolDefinition(definition(pattern))).toEqual({
        rejected: 'schema_unsupported',
        unsupported: limit,
      })
    })
  for (const character of ['a', '😀']) {
    it(`U2 ${character} 1024 codepoints accepted`, () =>
      expect(judgeToolDefinition(definition(character.repeat(1024)))).toEqual({ ok: true }))
    it(`U2 ${character} 1025 codepoints rejected`, () =>
      expect(judgeToolDefinition(definition(character.repeat(1025)))).toEqual({
        rejected: 'schema_unsupported',
        unsupported: 'U-2',
      }))
  }
  it('provider registered values remain 1024/1000', () => {
    expect(PATTERN_MAX_CODE_POINTS).toBe(1024)
    expect(PATTERN_MAX_FINITE_COUNT).toBe(1000)
  })
  it('U1 actual per-pattern semantics and mixed flags in one schema', () => {
    const d = {
      name: 't',
      description: 'd',
      paradigm: 'single' as const,
      input: {
        type: 'object',
        properties: {
          legacy: { type: 'string', description: 'legacy', pattern: '\\-' },
          unicode: { type: 'string', description: 'unicode', pattern: '[\\u{1F600}-\\u{1F64F}]' },
        },
        required: ['legacy', 'unicode'],
      },
      permissions: { execute: { default: 'ask' as const } },
      origin: { kind: 'authored' as const },
    }
    const judge = createParameterJudge()
    expect(judge.judgeCallArguments(d, { legacy: '-', unicode: '😀' })).toHaveProperty('ok')
    expect(judge.judgeCallArguments(d, { legacy: '-', unicode: 'x' })).toHaveProperty('invalid')
    for (const [pattern, value, pass] of [
      ['^.$', '😀', false],
      ['^\\u{41}$', 'A', false],
      ['^\\p{L}$', 'A', false],
      ['^.$', 'a', true],
    ] as const) {
      const input = definition(pattern)
      if (!isToolDefinition(input)) throw new Error('fixture')
      expect('ok' in judge.judgeCallArguments(input, { q: value })).toBe(pass)
    }
  })
  it('invalid ECMAScript precedes missing description, U limits come last', () => {
    const bad = definition('^(')
    Reflect.deleteProperty(bad.input.properties.q, 'description')
    expect(judgeToolDefinition(bad)).toEqual({ rejected: 'input_not_schema' })
    expect(
      judgeToolDefinition({
        ...definition('(a+)+'),
        permissions: { execute: { default: 'allow' } },
      }),
    ).toEqual({ rejected: 'permission_unknown' })
    expect(judgeToolDefinition({ ...definition('(a+)+'), name: 'a__b' })).toEqual({
      rejected: 'name_reserved_sequence',
    })
  })
})
