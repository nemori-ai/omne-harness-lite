import { describe, expect, it, vi } from 'vitest'
import {
  LosslessNumber,
  jsonNumberSource,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  CredentialRedactionConfigurationError,
  createCredentialRedactionPolicy,
  openRouterCredentialRedactionConfig,
  redact,
  type CredentialRedactionConfig,
  type CredentialRedactionResult,
} from '../src/index.ts'

function value<T>(result: CredentialRedactionResult<T>): T {
  if (!('ok' in result)) throw new Error('accepted fixture expected')
  return result.ok
}

function config(minimum = 8): CredentialRedactionConfig {
  return {
    credential_fragment_min_length: minimum,
    credential_header_names: [],
    credential_patterns: [],
  }
}

function bound(credential: string, policy = openRouterCredentialRedactionConfig) {
  return value(createCredentialRedactionPolicy(policy).bind(credential))
}

function originalPositions(input: string, credential: string, minimum: number): string {
  const marked = Array.from(input, () => false)
  const fragments = [credential]
  for (let size = minimum; size <= credential.length; size++)
    for (let start = 0; start + size <= credential.length; start++)
      fragments.push(credential.slice(start, start + size))
  for (const fragment of fragments)
    for (let start = 0; start + fragment.length <= input.length; start++)
      if (input.slice(start, start + fragment.length) === fragment)
        for (let i = start; i < start + fragment.length; i++) marked[i] = true
  let expected = ''
  for (let i = 0; i < input.length; i++)
    if (!marked[i]) expected += input[i]
    else if (i === 0 || !marked[i - 1]) expected += '█'
  return expected
}

describe('SPEC explicit credential redaction with original-input accounting', () => {
  it('unions overlapping original fragments, protects complete short credentials and is idempotent', () => {
    for (const credential of ['abcabc', 'aaaaaaaaa', 'abcdefghijk', '123456789'])
      for (const minimum of [1, 3, 8, 12]) {
        const policy = bound(credential, config(minimum))
        const input = `>${credential}<${credential.slice(1, 9)}█${credential.slice(0, 8)}!`
        const result = value(policy.text(input))
        expect(result).toBe(originalPositions(input, credential, minimum))
        expect(value(policy.text(result))).toBe(result)
      }
    expect(value(bound('abc', config(8)).text('abc abcX'))).toBe('█ █X')
    expect(value(bound('abcd', config(2)).text('ab█cd / ABCD / a'))).toBe('███ / ABCD / a')
  })

  it.each([
    ['sk-a', '█'],
    ['sk-', 'sk-'],
    ['SK-a', 'SK-a'],
    ['sk-Az09_-+/=', '█+/='],
    ['Bearer abc==.', '█'],
    ['bAsIc\t \tAA==!', '█!'],
    ['bearerish abc', 'bearerish abc'],
    ['bearer\nabc', 'bearer\nabc'],
    ['Bearer ', 'Bearer '],
    ['xBearer a/b~+=,y', 'x█,y'],
    ['sk-a█sk-b', '███'],
  ])('uses finite exact descriptors for %j', (input, expected) => {
    expect(value(bound('never-known').text(input))).toBe(expected)
  })

  it('uses literal prefixes and exact alphabets, with no implicit regex or Unicode folding', () => {
    const policy = bound('never-known', {
      ...config(),
      credential_patterns: [
        { kind: 'prefix-token', prefix: '.*', alphabet: 'auth' },
        { kind: 'scheme-token', scheme: 'KEY', alphabet: 'key' },
      ],
    })
    expect(value(policy.text('.*a+/=, .zz kEy\tfoo.bar'))).toBe('█, .zz █.bar')
    expect(value(policy.text('KEY\nfoo .*'))).toBe('KEY\nfoo .*')
  })

  it('preserves exact numeric tokens, negative zero and scalar type unless a protected token matches', () => {
    const input: JsonValue = [
      new LosslessNumber('9007199254740993123'),
      new LosslessNumber('1.0000e+9007199254740993'),
      -0,
      true,
      false,
      null,
    ]
    const retained = value(bound('never-known').json(input))
    expect(writeJsonLossless(retained)).toBe(
      '[9007199254740993123,1.0000e+9007199254740993,-0,true,false,null]',
    )
    if (!Array.isArray(retained) || !LosslessNumber.is(retained[0]))
      throw new Error('exact number expected')
    expect(jsonNumberSource(retained[0])).toBe('9007199254740993123')
    expect(retained[0]).not.toBe(input[0])
    expect(Object.is(retained[2], -0)).toBe(true)
    expect(value(bound('123', config(8)).json(input))).toEqual([
      '█',
      new LosslessNumber('1.0000e+9007199254740993'),
      -0,
      true,
      false,
      null,
    ])
    expect(value(bound('-0').json(-0))).toBe('█')
    for (const credential of ['true', 'false', 'null'])
      expect(writeJsonLossless(value(bound(credential).json([true, false, null])))).toBe(
        credential === 'true'
          ? '["█",false,null]'
          : credential === 'false'
            ? '[true,"█",null]'
            : '[true,false,"█"]',
      )
  })

  it('retains every colliding or prototype-looking key, copies input and freezes nested outputs', () => {
    const input: JsonValue = JSON.parse(
      '{"secret":1,"█":2,"a-secret":3,"a-█":4,"__proto__":{"secret":5},"constructor":6}',
    )
    const policy = bound('secret')
    const result = value(policy.json(input))
    expect(writeJsonLossless(result)).toBe(
      '{"██":1,"█":2,"a-██":3,"a-█":4,"__proto__":{"█":5},"constructor":6}',
    )
    expect(Object.getPrototypeOf(result)).toBe(null)
    expect(Object.isFrozen(result)).toBe(true)
    expect(value(policy.json(result))).toEqual(result)
    expect(writeJsonLossless(input)).toBe(
      '{"secret":1,"█":2,"a-secret":3,"a-█":4,"__proto__":{"secret":5},"constructor":6}',
    )
    let nested: JsonValue = 'secret'
    for (let i = 0; i < 500; i++) nested = [nested]
    let actual = value(policy.json(nested))
    for (let i = 0; i < 500; i++) {
      expect(Object.isFrozen(actual)).toBe(true)
      if (!Array.isArray(actual) || actual[0] === undefined) throw new Error('nested shape changed')
      actual = actual[0]
    }
    expect(actual).toBe('█')
  })

  it('strips original denylist names before renaming, retains arrays and does not trim or Unicode-fold names', () => {
    const input = {
      Authorization: 'discard',
      ' authorization ': 'kept',
      'ſet-cookie': 'kept',
      X: ['', 'secret', 'secret'],
      Empty: [],
      secret: 'one',
      '█': 'two',
    }
    const result = value(bound('secret').headers(input))
    expect(result).toEqual({
      ' authorization ': 'kept',
      'ſet-cookie': 'kept',
      X: ['', '█', '█'],
      Empty: [],
      '██': 'one',
      '█': 'two',
    })
    expect(result.X).not.toBe(input.X)
    expect(Object.isFrozen(result.X)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(
      value(
        bound('authorization').headers({ authorization: 'discard', ' authorization ': 'kept' }),
      ),
    ).toEqual({ ' █ ': 'kept' })
    expect(value(bound('secret').headers({}))).toEqual({})
  })

  it('captures explicit configuration independently of caller mutations and never exposes the credential', () => {
    const caller = {
      credential_fragment_min_length: 8,
      credential_header_names: ['authorization'],
      credential_patterns: [{ kind: 'prefix-token', prefix: 'sk-', alphabet: 'key' }],
    } satisfies CredentialRedactionConfig
    const policy = createCredentialRedactionPolicy(caller)
    caller.credential_fragment_min_length = 64
    caller.credential_header_names.splice(0)
    const pattern = caller.credential_patterns[0]
    if (pattern !== undefined) pattern.prefix = 'xx-'
    const redactor = value(policy.bind('abcdefghijk'))
    expect(value(redactor.text('abcdefgh sk-a'))).toBe('█ █')
    expect(value(redactor.headers({ Authorization: 'discard' }))).toEqual({})
    expect(Object.keys(policy)).toEqual(['bind'])
    expect(Object.keys(redactor)).toEqual(['text', 'headers', 'json'])
    expect(Object.isFrozen(redactor)).toBe(true)
  })

  it('rejects invalid explicit policies, credentials and text or header shapes through public decisions', () => {
    const baseline = openRouterCredentialRedactionConfig
    const invalid: unknown[] = [
      null,
      undefined,
      {},
      { ...baseline, extra: true },
      ...[0, 65, 1.5, NaN].map(credential_fragment_min_length => ({
        ...baseline,
        credential_fragment_min_length,
      })),
      ...[
        ['Authorization'],
        ['a', 'a'],
        [''],
        [' a'],
        ['a\n'],
        ['ü'],
        ['a'.repeat(129)],
        Array.from({ length: 129 }, (_, i) => `x-${i}`),
      ].map(credential_header_names => ({ ...baseline, credential_header_names })),
      ...[
        { kind: 'regex', source: 'secret.*' },
        { kind: 'prefix-token', prefix: '', alphabet: 'key' },
        { kind: 'prefix-token', prefix: 'a'.repeat(65), alphabet: 'key' },
        { kind: 'prefix-token', prefix: '\n', alphabet: 'key' },
        { kind: 'prefix-token', prefix: 'a', alphabet: 'unknown' },
        { kind: 'scheme-token', scheme: 'bear er', alphabet: 'auth' },
        { kind: 'scheme-token', scheme: 'bearer1', alphabet: 'auth' },
        { kind: 'prefix-token', prefix: 'a', alphabet: 'key', flags: 'i' },
      ].map(p => ({ ...baseline, credential_patterns: [p] })),
      {
        ...baseline,
        credential_patterns: [baseline.credential_patterns[0], baseline.credential_patterns[0]],
      },
      {
        ...baseline,
        credential_patterns: Array.from({ length: 65 }, (_, i) => ({
          kind: 'prefix-token',
          prefix: `p${i}`,
          alphabet: 'key',
        })),
      },
    ]
    for (const input of invalid) {
      expect(() => Reflect.apply(createCredentialRedactionPolicy, undefined, [input])).toThrow(
        CredentialRedactionConfigurationError,
      )
      expect(Reflect.apply(redact, undefined, ['safe', 'known', input])).toEqual({
        rejected: 'invalidInput',
      })
    }
    for (const credential of ['', '\n', '\x7f', 'ü', 'a\x00b'])
      expect(createCredentialRedactionPolicy(baseline).bind(credential)).toEqual({
        rejected: 'invalidInput',
      })
    const policy = bound('known')
    for (const input of [false, null, 0, [], { A: null }, { A: [1] }, { A: [['bad']] }]) {
      expect(Reflect.apply(policy.headers, undefined, [input])).toEqual({
        rejected: 'invalidInput',
      })
      expect(Reflect.apply(policy.text, undefined, [input])).toEqual({ rejected: 'invalidInput' })
    }
    expect(value(redact('known', 'known', config()))).toBe('█')
    expect(Reflect.apply(redact, undefined, ['known', 'known'])).toEqual({
      rejected: 'invalidInput',
    })
  })

  it('rejects foreign getters, proxies, cycles and non-data JSON without executing input accessors', () => {
    let reads = 0
    const getter = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        reads++
        throw new Error('synthetic secret')
      },
    })
    const hidden = Object.defineProperty({}, 'value', { value: 1, enumerable: false })
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('synthetic secret')
        },
      },
    )
    const policy = bound('known')
    for (const input of [
      getter,
      hidden,
      cycle,
      proxy,
      {
        toJSON() {
          reads++
          return 'synthetic secret'
        },
      },
      new Date(),
      NaN,
      Object.assign([], { extra: 1 }),
      Array(1),
      { [Symbol('key')]: 1 },
      Symbol('value'),
    ])
      expect(Reflect.apply(policy.json, undefined, [input])).toEqual({ rejected: 'invalidInput' })
    expect(reads).toBe(0)
    class HostileNumber extends LosslessNumber {
      override get source(): string {
        reads++
        throw new Error('synthetic secret')
      }
    }
    expect(policy.json(new HostileNumber('1'))).toEqual({ rejected: 'invalidInput' })
    expect(reads).toBe(0)
  })

  it('propagates internal processing defects as controlled errors and never returns raw input', () => {
    const policy = bound('known')
    vi.stubGlobal('Uint32Array', function unavailable() {
      throw new Error('synthetic secret')
    })
    try {
      for (const operation of [
        () => policy.text('known'),
        () => policy.json('known'),
        () => policy.headers({ X: 'known' }),
        () => redact('known', 'known', config()),
      ]) {
        expect(operation).toThrow('Credential redaction processing failed')
        try {
          operation()
        } catch (error) {
          if (!(error instanceof Error)) throw new Error('controlled error expected')
          expect(error.message).not.toContain('synthetic secret')
          expect('cause' in error).toBe(false)
        }
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
