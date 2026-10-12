import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { createParameterJudge, isToolDefinition, judgeToolDefinition } from '../src/index.ts'

function json(text: string) {
  const result = readJsonStrict(text)
  if ('failed' in result) throw new Error(`bad fixture ${text}`)
  return result.ok
}
function definition(schema: string) {
  const value = json(
    `{"name":"t","description":"d","paradigm":"single","input":{"type":"object","properties":{"n":${schema}},"required":["n"]},"permissions":{"execute":{"default":"ask"}},"origin":{"kind":"authored"}}`,
  )
  if (!isToolDefinition(value)) throw new Error(`bad schema fixture ${schema}`)
  return value
}
describe('actual public parameter judgment retains exact JSON numeric meaning', () => {
  for (const [schema, raw, pass] of [
    ['{"type":"number","description":"n","minimum":9007199254740993}', '9007199254740992', false],
    ['{"type":"number","description":"n","minimum":9007199254740993}', '9007199254740993', true],
    ['{"type":"number","description":"n","maximum":9007199254740992}', '9007199254740993', false],
    ['{"type":"number","description":"n","minimum":0.10000000000000000000000001}', '0.1', false],
    [
      '{"type":"number","description":"n","maximum":0.10000000000000000000000001}',
      '0.10000000000000000000000002',
      false,
    ],
    ['{"type":"number","description":"n","minimum":1e400}', '1e399', false],
    ['{"type":"number","description":"n","minimum":1e400}', '1e400', true],
    ['{"type":"number","description":"n","minimum":-1e400}', '-1e401', false],
    ['{"type":"integer","description":"n"}', '1e400', true],
    ['{"type":"integer","description":"n"}', '1.00000000000000000000000001', false],
    ['{"type":"integer","description":"n"}', '1e-400', false],
    ['{"type":["integer","string"],"description":"n"}', '0.1', false],
    ['{"type":["integer","null"],"description":"n"}', '1e400', true],
    ['{"type":"number","description":"n","const":9007199254740993}', '9007199254740992', false],
    ['{"type":"number","description":"n","enum":[1.10]}', '1.1', true],
    ['{"type":"number","description":"n","enum":[9007199254740993]}', '9007199254740992', false],
    ['{"type":"number","description":"n","const":-0}', '0', true],
    ['{"description":"n","anyOf":[{"type":"integer"},{"const":0.1}]}', '0.1', true],
    [
      '{"description":"n","oneOf":[{"minimum":9007199254740993},{"maximum":9007199254740992}]}',
      '9007199254740992',
      true,
    ],
    [
      '{"description":"n","oneOf":[{"minimum":9007199254740993},{"maximum":9007199254740992}]}',
      '9007199254740992.5',
      false,
    ],
    [
      '{"type":"object","description":"n","const":{"v":9007199254740993}}',
      '{"v":9007199254740992}',
      false,
    ],
    ['{"type":"array","description":"n","items":{"type":"integer"}}', '[1,0.1]', false],
    [
      '{"type":"object","description":"n","additionalProperties":{"minimum":9007199254740993}}',
      '{"v":9007199254740992}',
      false,
    ],
    ['{"type":"string","description":"n","minLength":1e400}', '"tiny"', false],
    ['{"type":"string","description":"n","maxLength":1e400}', '"tiny"', true],
    ['{"type":"string","description":"n","minLength":2}', '"😀"', false],
    ['{"type":"string","description":"n","maxLength":1}', '"😀"', true],
  ] as const)
    it(`${schema} accepts ${raw}: ${pass}`, () => {
      const d = definition(schema)
      const args = json(`{"n":${raw}}`)
      const result = createParameterJudge().judgeCallArguments(d, args)
      expect('ok' in result).toBe(pass)
      expect(writeJsonLossless(args)).toBe(`{"n":${raw}}`)
      if ('ok' in result) expect(writeJsonLossless(result.ok.args)).toBe(`{"n":${raw}}`)
    })
  it('format is annotation even unknown; no whole-schema partial success fallback', () => {
    for (const format of ['email', 'unknown-format']) {
      const d = definition(`{"type":"string","description":"n","format":"${format}"}`)
      expect(createParameterJudge().judgeCallArguments(d, { n: 'not-an-email' })).toHaveProperty(
        'ok',
      )
    }
    const d = {
      name: 't',
      description: 'd',
      paradigm: 'single' as const,
      input: {
        type: 'object',
        properties: { n: { type: 'string', description: 'n', pattern: '(a+)+' } },
      },
      permissions: { execute: { default: 'ask' as const } },
      origin: { kind: 'authored' as const },
    }
    expect(judgeToolDefinition(d)).toMatchObject({ rejected: 'schema_unsupported' })
    expect(createParameterJudge().judgeCallArguments(d, { n: 'a' })).toHaveProperty('unsupported')
  })
})
