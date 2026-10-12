import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  recognize,
  parseInvocation,
  expandPrompt,
  judgeInvocation,
  judgeSlashCommand,
  judgeSlashCommandValue,
  validate,
  type CommandInvocation,
  type SlashCommandDefinition,
  type SessionCommandSet,
  type ParseResult,
} from '../src/index.ts'

function invocation(raw: string): CommandInvocation {
  const value = recognize(raw)
  if (value.kind !== 'invocation') throw new Error('invocation fixture required')
  return value.invocation
}
function call(raw: string, definition: SlashCommandDefinition): ParseResult {
  const input = invocation(raw)
  return parseInvocation(input, { [input.name]: definition })
}
function json(source: string): JsonValue {
  const result = readJsonStrict(source)
  if ('failed' in result) throw new Error('valid JSON fixture required')
  return result.ok
}
const prompt = (template: string): SlashCommandDefinition => ({
  description: 'p',
  binding: { kind: 'prompt', template },
})
const command = (parameters?: SlashCommandDefinition['parameters']): SlashCommandDefinition => ({
  description: 'c',
  binding: { kind: 'command', service: 'service.action' },
  ...(parameters === undefined ? {} : { parameters }),
})

describe('S-12..S-15 Unicode recognition independent scalar oracle', () => {
  // Literal contract W table; independence from the implementation's imported identity array.
  const w = [
    9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,
    8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279,
  ]
  for (const point of w)
    it(`W-U+${point.toString(16)} exact separator and edge trim`, () => {
      const space = String.fromCodePoint(point)
      const raw = `/𐐀😀${space}${space}a${space}b${space}${space}`
      expect(recognize(raw)).toEqual({
        kind: 'invocation',
        invocation: {
          raw,
          name: '𐐀😀',
          argumentText: `a${space}b`,
          span: { start: 0, end: 3 },
        },
      })
      expect(recognize(`${space}/x`)).toEqual({ kind: 'text', text: `${space}/x` })
      expect(recognize(`/${space}x`)).toEqual({ kind: 'text', text: `/${space}x` })
      expect(judgeSlashCommand(prompt(''), { capabilityName: `a${space}b` })).toEqual({
        rejected: 'name_invalid',
      })
    })
  for (const point of [0, 8, 0x180e, 0x200b, 0x2060])
    it(`non-W U+${point.toString(16)} stays in name`, () => {
      const name = `a${String.fromCodePoint(point)}b`
      expect(invocation(`/${name}`).name).toBe(name)
      expect(validate('CommandName', name).valid).toBe(true)
    })
  const names = ['a', 'é', 'é', '😀', '汉字', 'a:b', '𐐀😀x', 'OMNE-OFFICIAL:x']
  for (const name of names)
    for (const argument of ['', '/next', '😀 quoted', 'x\n\n/next'])
      it(`scalar-roundtrip ${JSON.stringify(name)} ${JSON.stringify(argument)}`, () => {
        const raw = `/${name}${argument === '' ? '' : `  ${argument}  `}`
        const result = invocation(raw)
        expect(result).toEqual({
          raw,
          name,
          argumentText: argument,
          span: { start: 0, end: 1 + [...name].length },
        })
        expect(judgeInvocation(result)).toEqual({ ok: true })
        expect(judgeInvocation({ ...result, argumentText: `${argument}x` })).toEqual({
          rejected: 'malformed',
        })
        expect(
          judgeInvocation({ ...result, span: { start: 0, end: 2 + [...name].length } }),
        ).toEqual({ rejected: 'malformed' })
      })
  it('R-precondition lone surrogates do not add a Recognition branch', () => {
    for (const raw of ['\ud800', '/x \udc00', '/\ud800']) {
      expect(() => recognize(raw)).toThrow(TypeError)
      expect(
        judgeInvocation({ raw, name: 'x', argumentText: '', span: { start: 0, end: 2 } }),
      ).toEqual({ rejected: 'malformed' })
    }
  })
  it('R-one-command slash arguments are literal; // removes exactly one slash', () => {
    expect(call('/x /y /z', prompt('$ARGUMENTS'))).toEqual({ kind: 'expanded', text: '/y /z' })
    expect(recognize('///x')).toEqual({ kind: 'literal', text: '//x' })
    expect(recognize('/a/b')).toEqual({ kind: 'text', text: '/a/b' })
    expect(recognize('/')).toEqual({ kind: 'text', text: '/' })
    expect(recognize('')).toEqual({ kind: 'text', text: '' })
  })
})

describe('S-17/S-18 exact tokens, binding and integer limits', () => {
  const s = command([{ name: 'x', kind: 'string', required: true, positional: true }])
  const tokenCases = [
    ["''", ''],
    ['""', ''],
    ['a"b c"d', 'ab cd'],
    ["a'b c'd", 'ab cd'],
    ['a\\ b', 'a b'],
    ['a\\', 'a\\'],
    ['"a\\qb"', 'a\\qb'],
    ['"a\\\"b"', 'a"b'],
    ['"a\\\\b"', 'a\\b'],
    ["'a\\b'", 'a\\b'],
    ['--', '--'],
    ['-x', '-x'],
    ['-7', '-7'],
    ['"type_mismatch"', 'type_mismatch'],
  ] as const
  for (const [source, text] of tokenCases)
    it(`token ${source} fixed oracle`, () =>
      expect(call(`/omne-official:x ${source}`, s)).toEqual({
        kind: 'command',
        service: 'service.action',
        arguments: { x: text },
      }))
  const n = command([{ name: 'x', kind: 'integer', required: true, positional: true }])
  for (const text of ['9007199254740991', '-9007199254740991', '0007', '-0', '0', '-0009'])
    it(`integer accepted ${text}`, () =>
      expect(call(`/omne-official:x ${text}`, n)).toEqual({
        kind: 'command',
        service: 'service.action',
        arguments: { x: Number(BigInt(text)) },
      }))
  for (const text of [
    '9007199254740992',
    '-9007199254740992',
    '+7',
    '7.0',
    '7e0',
    '0x7',
    '７',
    '7_0',
    '999999999999999999999999999999999999',
  ])
    it(`integer rejected ${text}`, () =>
      expect(call(`/omne-official:x ${text}`, n)).toMatchObject({
        kind: 'failed',
        reason: 'type_mismatch',
        at: { start: 17, end: 17 + [...text].length },
      }))
  const named = command([
    { name: 's', kind: 'string', required: false },
    { name: 'b', kind: 'boolean', required: false },
    { name: 'choice', kind: 'enum', required: false, values: ['x', 'enum_out_of_range'] },
  ])
  for (const [text, args] of [
    ['', {}],
    ['--s=', { s: '' }],
    ['--s --b', { s: '--b' }],
    ['--s ""', { s: '' }],
    ['--s=a=b', { s: 'a=b' }],
    ['--b', { b: true }],
    ['--b=false', { b: false }],
    ['--choice=enum_out_of_range', { choice: 'enum_out_of_range' }],
  ] as const)
    it(`named fixed oracle ${text}`, () =>
      expect(call(`/omne-official:x ${text}`, named)).toEqual({
        kind: 'command',
        service: 'service.action',
        arguments: args,
      }))
  for (const [text, reason] of [
    ['--b false', 'unexpected_argument'],
    ['--b=', 'type_mismatch'],
    ['--b=TRUE', 'type_mismatch'],
    ['--b --b=false', 'unexpected_argument'],
    ['--unknown=x', 'unexpected_argument'],
    ['--choice=', 'enum_out_of_range'],
    ['--s', 'missing_required'],
  ] as const)
    it(`named failure ${text}`, () =>
      expect(call(`/omne-official:x ${text}`, named)).toMatchObject({ kind: 'failed', reason }))
  it('B-absence and explicit empty declaration have different semantics', () => {
    expect(call('/omne-official:x free raw', command())).toEqual({
      kind: 'command',
      service: 'service.action',
    })
    expect(call('/omne-official:x', command([]))).toEqual({
      kind: 'command',
      service: 'service.action',
      arguments: {},
    })
    expect(call('/omne-official:x anything', command([]))).toMatchObject({
      kind: 'failed',
      reason: 'unexpected_argument',
    })
    expect(call('/x "not closed', prompt('no parameters'))).toEqual({
      kind: 'expanded',
      text: 'no parameters\n\nARGUMENTS: "not closed',
    })
  })
  it('B-tokenization before binding; unknown before unterminated; first lexical opening span', () => {
    const raw = '/omne-official:x --unknown=bad "😀  '
    expect(call(raw, named)).toMatchObject({
      kind: 'failed',
      reason: 'unterminated_quote',
      at: { start: 31, end: 35 },
    })
    const unknown = parseInvocation(invocation(raw), {})
    expect(unknown).toMatchObject({
      kind: 'failed',
      reason: 'unknown_command',
      at: { start: 0, end: 16 },
    })
    expect(call('/omne-official:x --b=no --unknown=bad', named)).toMatchObject({
      kind: 'failed',
      reason: 'type_mismatch',
    })
  })
  it('B-required checked after supplied tokens, omitted no defaults', () => {
    const required = command([
      { name: 'x', kind: 'string', required: true },
      { name: 'b', kind: 'boolean', required: false },
    ])
    const result = call('/omne-official:x', required)
    expect(result).toMatchObject({ kind: 'failed', reason: 'missing_required' })
    expect(Object.hasOwn(result, 'at')).toBe(false)
    expect(call('/omne-official:x --unknown', required)).toMatchObject({
      kind: 'failed',
      reason: 'unexpected_argument',
    })
  })
  it('B-own keys __proto__/constructor are data and cannot pollute prototypes', () => {
    const set: SessionCommandSet = Object.fromEntries([['__proto__', prompt('$ARGUMENTS')]])
    expect(parseInvocation(invocation('/__proto__ ok'), set)).toEqual({
      kind: 'expanded',
      text: 'ok',
    })
    expect(parseInvocation(invocation('/toString'), {})).toMatchObject({
      kind: 'failed',
      reason: 'unknown_command',
    })
    const result = call(
      '/omne-official:x --constructor=value',
      command([{ name: 'constructor', kind: 'string', required: false }]),
    )
    expect(result).toEqual({
      kind: 'command',
      service: 'service.action',
      arguments: { constructor: 'value' },
    })
    expect({}.constructor).toBe(Object)
  })
})

describe('S-10/S-21 single scan template fixed oracles', () => {
  for (const [template, text] of [
    ['$ARGUMENTS[0]', 'x[0]'],
    ['$ARGUMENTSX', 'xX'],
    ['$args', '$args\n\nARGUMENTS: x'],
    ['\\$ARGUMENTS', '$ARGUMENTS\n\nARGUMENTS: x'],
    ['\\\\$ARGUMENTS', '\\\\x'],
    ['\\\\\\$ARGUMENTS', '\\\\\\x'],
  ] as const)
    it(`T-escape ${JSON.stringify(template)}`, () =>
      expect(call('/x x', prompt(template))).toEqual({ kind: 'expanded', text }))
  it('T-expansion never rescans substituted $ARGUMENTS or $0', () => {
    expect(call('/x $ARGUMENTS $0', prompt('$ARGUMENTS'))).toEqual({
      kind: 'expanded',
      text: '$ARGUMENTS $0',
    })
    const definition: SlashCommandDefinition = {
      ...prompt('$0'),
      parameters: [{ name: 'x', kind: 'string', required: true, positional: true }],
    }
    expect(call('/x $0', definition)).toEqual({ kind: 'expanded', text: '$0' })
    expect(expandPrompt(definition, invocation('/x $ARGUMENTS'))).toEqual({
      kind: 'expanded',
      text: '$ARGUMENTS',
    })
  })
  it('T-positional lexical integer spelling retained and optional absence empty', () => {
    const definition: SlashCommandDefinition = {
      ...prompt('$0/$1'),
      parameters: [
        { name: 'i', kind: 'integer', required: true, positional: true },
        { name: 's', kind: 'string', required: false, positional: true },
      ],
    }
    expect(call('/x 0007', definition)).toEqual({ kind: 'expanded', text: '0007/' })
  })
  it('T-longest decimal index, escaped out-of-range literal and declared binding coverage', () => {
    const params = [{ name: 'x', kind: 'string', required: true, positional: true }] as const
    expect(judgeSlashCommand({ ...prompt('$01'), parameters: params })).toEqual({
      rejected: 'malformed',
    })
    expect(
      judgeSlashCommand({ ...prompt('$0 \\$99999999999999999999'), parameters: params }),
    ).toEqual({ ok: true })
    expect(call('/x a', { ...prompt('$0 \\$9'), parameters: params })).toEqual({
      kind: 'expanded',
      text: 'a $9',
    })
    expect(judgeSlashCommand({ ...prompt('constant'), parameters: params })).toEqual({
      rejected: 'malformed',
    })
    expect(
      judgeSlashCommand({
        ...prompt('$0'),
        parameters: [{ name: 'n', kind: 'string', required: false }],
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeSlashCommand({
        ...prompt('$ARGUMENTS'),
        parameters: [{ name: 'n', kind: 'string', required: false }],
      }),
    ).toEqual({ ok: true })
    expect(call('/x', prompt('$ARGUMENTS'))).toEqual({ kind: 'expanded', text: '' })
  })
})

describe('S-26..S-29 boundaries, priority, immutability and exact numbers', () => {
  it('J-ordered predicates before malformed and never repair the body', () => {
    const value = {
      description: '',
      binding: { kind: 'unknown' },
      parameters: [{ name: 'x' }, { name: 'x', positional: true }],
    }
    const before = JSON.stringify(value)
    expect(judgeSlashCommand(value, { capabilityName: 'a/b' })).toEqual({
      rejected: 'binding_unknown',
    })
    expect(
      judgeSlashCommand({ ...value, binding: { kind: 'prompt' } }, { capabilityName: 'a/b' }),
    ).toEqual({ rejected: 'name_invalid' })
    expect(
      judgeSlashCommand(
        { ...value, binding: { kind: 'prompt' } },
        { capabilityName: 'omne-official:x' },
      ),
    ).toEqual({ rejected: 'name_reserved' })
    expect(judgeSlashCommand({ ...value, binding: { kind: 'prompt' } })).toEqual({
      rejected: 'parameter_duplicate',
    })
    expect(
      judgeSlashCommand({
        ...value,
        binding: { kind: 'prompt' },
        parameters: [{ name: 'a' }, { name: 'b', positional: true }],
      }),
    ).toEqual({ rejected: 'positional_after_named' })
    expect(JSON.stringify(value)).toBe(before)
  })
  for (const name of ['OMNE-OFFICIAL:x', 'OmNe-OfFiCiAl:x', 'omne-official:', 'omne-official:x y'])
    it(`J-reserved lexical ${name}`, () =>
      expect(judgeSlashCommand(command(), { capabilityName: name, origin: 'official' })).toEqual({
        rejected: 'name_invalid',
      }))
  it('J-ASCII prefix only; case and Unicode normalization stay distinct', () => {
    expect(judgeSlashCommand(prompt('$ARGUMENTS'), { capabilityName: 'omne-offıcıal:x' })).toEqual({
      ok: true,
    })
    expect(parseInvocation(invocation('/É'), { é: prompt('$ARGUMENTS') })).toMatchObject({
      kind: 'failed',
      reason: 'unknown_command',
    })
    expect(parseInvocation(invocation('/é'), { é: prompt('$ARGUMENTS') })).toMatchObject({
      kind: 'failed',
      reason: 'unknown_command',
    })
    expect(
      judgeSlashCommand(command(), { capabilityName: 'omne-official:x', origin: 'customized' }),
    ).toEqual({ rejected: 'name_reserved' })
  })
  for (const [source, accepted] of [
    ['{"start":1e400,"end":2e400}', true],
    ['{"start":2e400,"end":1e400}', false],
    ['{"start":-0,"end":0.0}', true],
    ['{"start":1.000e3,"end":1001}', true],
    ['{"start":0,"end":0.01}', false],
    ['{"start":-1,"end":0}', false],
  ] as const)
    it(`J-exact span ${source}`, () =>
      expect(judgeSlashCommandValue('Span', json(source))).toEqual(
        accepted ? { ok: true } : { rejected: 'malformed' },
      ))
  it('J-original raw bounds checked without rounding', () => {
    expect(judgeSlashCommandValue('Span', json('{"start":0,"end":1e400}'), { raw: '/😀' })).toEqual(
      { rejected: 'malformed' },
    )
    expect(judgeSlashCommandValue('Span', { start: 0, end: 2 }, { raw: '/😀' })).toEqual({
      ok: true,
    })
    expect(
      judgeSlashCommandValue('ParseResult', {
        kind: 'failed',
        reason: 'unknown_command',
        explanation: 'x',
      }),
    ).toEqual({ rejected: 'malformed' })
    expect(
      judgeSlashCommandValue('ParseResult', {
        kind: 'failed',
        reason: 'missing_required',
        explanation: 'x',
      }),
    ).toEqual({ ok: true })
  })
  it('J-not-JSON, cyclic, undefined and accessors are rejected without invocation', () => {
    let reads = 0
    const accessor = {
      get description() {
        reads++
        return 'x'
      },
      binding: { kind: 'prompt', template: '' },
    }
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    for (const value of [
      accessor,
      cycle,
      undefined,
      new Map(),
      { ...prompt(''), parameters: undefined },
    ])
      expect(judgeSlashCommand(value)).toEqual({ rejected: 'malformed' })
    expect(reads).toBe(0)
  })
  it('J-parsing snapshots input; outputs frozen and independent of caller mutations', () => {
    const definition = command([{ name: 's', kind: 'string', required: false }])
    const input = invocation('/omne-official:x --s=x')
    const before = writeJsonLossless(definition)
    const parsed = parseInvocation(input, { 'omne-official:x': definition })
    expect(writeJsonLossless(definition)).toBe(before)
    expect(Object.isFrozen(parsed)).toBe(true)
    if (parsed.kind !== 'command' || parsed.arguments === undefined)
      throw new Error('command expected')
    const argumentsValue = parsed.arguments
    expect(Object.isFrozen(argumentsValue)).toBe(true)
    expect(Object.isFrozen(input.span)).toBe(true)
    expect(Reflect.set(argumentsValue, 's', 'mutated')).toBe(false)
    expect(argumentsValue.s).toBe('x')
  })
})
