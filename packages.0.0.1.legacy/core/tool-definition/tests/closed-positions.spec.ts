import { describe, expect, it } from 'vitest'
import { judgeToolDefinition, judgeToolReturn, validate } from '../src/index.ts'

const base = {
  name: 't',
  description: 'd',
  paradigm: 'single',
  input: { type: 'object', properties: {} },
  permissions: { execute: { default: 'ask' } },
  origin: { kind: 'authored' },
}
function withInput(input: unknown) {
  return { ...base, input }
}
describe('S4 closed schema-position inventory and S26 ordered predicates', () => {
  for (const keyword of [
    '$ref',
    '$id',
    '$defs',
    '$schema',
    'title',
    'allOf',
    'not',
    'if',
    'then',
    'else',
    'patternProperties',
    'multipleOf',
  ])
    it(`M27 forbidden keyword ${keyword}`, () => {
      const value =
        keyword === 'allOf'
          ? [{ type: 'string' }]
          : keyword === 'not' || keyword === 'if' || keyword === 'then' || keyword === 'else'
            ? { type: 'string' }
            : keyword === 'multipleOf'
              ? 1
              : keyword === '$defs' || keyword === 'patternProperties'
                ? {}
                : 'annotation'
      expect(
        judgeToolDefinition(withInput({ type: 'object', properties: {}, [keyword]: value })),
      ).toMatchObject({ rejected: 'malformed', malformed: 'M27' })
    })
  it('data values inside enum const default and property names are not keywords or nested schemas', () => {
    for (const keyword of ['enum', 'const', 'default']) {
      const data = {
        title: 'value',
        allOf: [{ properties: { noDescription: { type: 'string' } } }],
        pattern: '^(',
      }
      const input = {
        type: 'object',
        properties: {
          title: {
            type: 'object',
            description: 'title',
            [keyword]: keyword === 'enum' ? [data] : data,
          },
        },
      }
      expect(judgeToolDefinition(withInput(input))).toEqual({ ok: true })
    }
  })
  for (const placement of ['items', 'additionalProperties', 'anyOf', 'oneOf'])
    it(`missing description is found under ${placement}`, () => {
      const nested = { type: 'object', properties: { key: { type: 'string' } } }
      const schema = {
        type: 'object',
        properties: {
          p: {
            type: placement === 'items' ? 'array' : 'object',
            description: 'p',
            [placement]: placement === 'anyOf' || placement === 'oneOf' ? [nested] : nested,
          },
        },
      }
      expect(judgeToolDefinition(withInput(schema))).toEqual({
        rejected: 'parameter_description_missing',
      })
    })
  it('illegal Draft under unpresentable allOf precedes missing descriptions and M27', () => {
    expect(
      judgeToolDefinition(
        withInput({
          type: 'object',
          properties: { q: { type: 'string' } },
          allOf: [{ pattern: '^(' }],
        }),
      ),
    ).toEqual({ rejected: 'input_not_schema' })
  })
  it('Draft minLength fractional and negative are input_not_schema even with LosslessNumber', async () => {
    const { readJsonStrict } = await import('@omne-harness-lite/content-blocks')
    for (const raw of ['0.1', '-0.1', '-1', '1e-400']) {
      const parsed = readJsonStrict(
        `{"type":"object","properties":{"q":{"type":"string","description":"q","minLength":${raw}}}}`,
      )
      if ('failed' in parsed) throw new Error('fixture')
      expect(judgeToolDefinition(withInput(parsed.ok))).toEqual({ rejected: 'input_not_schema' })
    }
  })
  it('special enum rejections outrank late required-member failures', () => {
    expect(
      judgeToolDefinition({ paradigm: 'single', permissions: { execute: { default: null } } }),
    ).toEqual({ rejected: 'permission_unknown' })
    expect(judgeToolDefinition({ ...base, name: 'a__b', origin: { kind: 'alien' } })).toEqual({
      rejected: 'tool_origin_unknown',
    })
    expect(
      judgeToolDefinition({
        ...base,
        settings: {
          timeout: { category: 'x', default: 'bad' },
          targetEnvironment: {
            category: 'preference',
            default: { bindingLayer: 'wrong', facilities: [] },
          },
        },
      }),
    ).toEqual({ rejected: 'binding_layer_unknown' })
  })
  it('return attachment precision remains original and exact, never projected numeric zero', async () => {
    const { readJsonStrict } = await import('@omne-harness-lite/content-blocks')
    for (const [raw, pass] of [
      ['1e400', true],
      ['9007199254740993', true],
      ['0.1', false],
      ['-1', false],
    ] as const) {
      const parsed = readJsonStrict(
        `{"content":[],"attachments":[{"storage":"s","key":"k","mediaType":"application/json","bytes":${raw}}]}`,
      )
      if ('failed' in parsed) throw new Error('fixture')
      expect('ok' in judgeToolReturn(parsed.ok)).toBe(pass)
      expect(validate('ToolReturn', parsed.ok).valid).toBe(pass)
    }
  })
})
