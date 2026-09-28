import { describe, expect, it, vi } from 'vitest'
import {
  LosslessNumber,
  jsonNumberSource,
  writeJsonLossless,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import {
  createCredentialRedactionPolicy,
  CredentialRedactionConfigurationError,
  openRouterCredentialRedactionConfig as baseline,
  redact,
  type CredentialRedactionConfig,
  type CredentialRedactionResult,
} from '@omne-harness-lite/model-request-runtime'

function value<T>(result: CredentialRedactionResult<T>): T {
  if (!('ok' in result)) throw new Error('Expected accepted synthetic input')
  return result.ok
}

function generic(minimum: number): CredentialRedactionConfig {
  return {
    credential_fragment_min_length: minimum,
    credential_header_names: [],
    credential_patterns: [],
  }
}

function bound(credential = 'abcdefghijk', config = baseline) {
  return value(createCredentialRedactionPolicy(config).bind(credential))
}

/** Deliberately simple original-input oracle, independent of the implementation's window scan. */
function knownOracle(input: string, credential: string, minimum: number): string {
  const mask = Array.from(input, () => false)
  const candidates = new Set([credential])
  for (let size = minimum; size <= credential.length; size++)
    for (let start = 0; start + size <= credential.length; start++)
      candidates.add(credential.slice(start, start + size))
  for (const candidate of candidates) {
    for (let offset = 0; offset + candidate.length <= input.length; offset++) {
      if (input.slice(offset, offset + candidate.length) !== candidate) continue
      for (let index = offset; index < offset + candidate.length; index++) mask[index] = true
    }
  }
  let output = ''
  for (let index = 0; index < input.length; index++) {
    if (!mask[index]) output += input[index]
    else if (index === 0 || !mask[index - 1]) output += '█'
  }
  return output
}

describe('D093 shared original-input kernel', () => {
  it.each([
    ['abc', 8, 'abc abcX', '█ █X'],
    ['abcdefghijk', 8, 'abcdefgh/abcdefghijk/bcdefghi/jk', '█/█/█/jk'],
    ['abcabc', 3, 'zabcabcabcZ', 'z█Z'],
    ['abcd', 2, 'ab█cd / ABCD / a', '███ / ABCD / a'],
  ])('full values and union %s %s', (credential, minimum, input, expected) => {
    if (
      typeof credential !== 'string' ||
      typeof minimum !== 'number' ||
      typeof input !== 'string' ||
      typeof expected !== 'string'
    )
      throw new Error('fixture')
    const policy = bound(credential, generic(minimum))
    const actual = value(policy.text(input))
    expect(actual).toBe(expected)
    expect(value(policy.text(actual))).toBe(actual)
  })

  it('each protected contiguous fragment uses original positions, with independent exhaustive oracle', () => {
    for (const credential of ['abcabc', 'aaaaaaaaa', 'ababcbabc', '123456789']) {
      for (let minimum = 1; minimum <= 10; minimum++) {
        const policy = bound(credential, generic(minimum))
        for (let start = 0; start < credential.length; start++) {
          for (let size = 1; start + size <= credential.length; size++) {
            const fragment = credential.slice(start, start + size)
            const input = `>${fragment}<${credential}█${fragment}!`
            const actual = value(policy.text(input))
            expect(actual).toBe(knownOracle(input, credential, minimum))
            expect(value(policy.text(actual))).toBe(actual)
          }
        }
      }
    }
  })

  it.each([
    ['sk-a', '█'],
    ['xsk-a.', 'x█.'],
    ['sk-', 'sk-'],
    ['SK-a', 'SK-a'],
    ['sk-Az09_-+/=', '█+/='],
    ['Bearer abc==.', '█'],
    ['bAsIc\t \tAA==!', '█!'],
    ['bearerish abc', 'bearerish abc'],
    ['bearer\nabc', 'bearer\nabc'],
    ['Bearer ', 'Bearer '],
    ['basic\t', 'basic\t'],
    ['xBearer a/b~+=,y', 'x█,y'],
    ['sk-ask-aZ', '█'],
    ['sk-a█sk-b', '███'],
    ['Bearer█ abc', 'Bearer█ abc'],
  ])('finite descriptors %j', (input, expected) => {
    const policy = bound('never-known')
    const actual = value(policy.text(input))
    expect(actual).toBe(expected)
    expect(value(policy.text(actual))).toBe(actual)
  })

  it('both alphabets are exact and literal prefixes do not become regex', () => {
    const policy = bound('never-known', {
      ...generic(8),
      credential_patterns: [
        { kind: 'prefix-token', prefix: '.*', alphabet: 'auth' },
        { kind: 'scheme-token', scheme: 'KEY', alphabet: 'key' },
      ],
    })
    expect(value(policy.text('.*a+/=, .zz kEy\tfoo.bar'))).toBe('█, .zz █.bar')
  })
})

describe('raw/error JSON and original header facts', () => {
  it.each(['true', 'false', 'null'])(
    'nonstring scalar %s uses its exact token even below m',
    credential => {
      const policy = bound(credential)
      const input: JsonValue = [true, false, null, 'true', 'false', 'null', { flag: true }]
      const expected =
        credential === 'true'
          ? ['█', false, null, '█', 'false', 'null', { flag: '█' }]
          : credential === 'false'
            ? [true, '█', null, 'true', '█', 'null', { flag: true }]
            : [true, false, '█', 'true', 'false', '█', { flag: true }]
      const actual = value(policy.json(input))
      expect(actual).toEqual(expected)
      expect(value(policy.json(actual))).toEqual(expected)
      expect(input).toEqual([true, false, null, 'true', 'false', 'null', { flag: true }])
    },
  )

  it('exact huge integers, exponents and negative zero never round trip through IEEE754', () => {
    const input = [
      new LosslessNumber('9007199254740993123'),
      new LosslessNumber('-0'),
      new LosslessNumber('1.0000e+9007199254740993'),
      -0,
      25,
      false,
      null,
    ]
    const policy = bound('123', generic(8))
    const actual = value(policy.json(input))
    expect(writeJsonLossless(actual)).toBe('["█",-0,1.0000e+9007199254740993,-0,25,false,null]')
    expect(writeJsonLossless(value(policy.json(actual)))).toBe(writeJsonLossless(actual))
    const retained = value(bound('never-known').json(input))
    if (!Array.isArray(retained) || !LosslessNumber.is(retained[0]))
      throw new Error('exact number expected')
    expect(jsonNumberSource(retained[0])).toBe('9007199254740993123')
    expect(retained[0]).not.toBe(input[0])
    expect(Object.is(retained[3], -0)).toBe(true)
    expect(value(bound('-0').json(-0))).toBe('█')
    expect(value(bound('e+900').json(new LosslessNumber('1e+900')))).toBe('█')
  })

  it('object keys, collisions and prototype-looking members retain every entry', () => {
    const input: Record<string, JsonValue> = JSON.parse(
      '{"secret":1,"█":2,"a-secret":3,"a-█":4,"__proto__":{"secret":5},"constructor":6}',
    )
    const policy = bound('secret')
    const actual = value(policy.json(input))
    expect(actual).toEqual(
      JSON.parse('{"██":1,"█":2,"a-██":3,"a-█":4,"__proto__":{"█":5},"constructor":6}'),
    )
    expect(Object.getPrototypeOf(actual)).toBe(null)
    if (actual === null || typeof actual !== 'object') throw new Error('object expected')
    expect(Object.keys(actual)).toEqual(['██', '█', 'a-██', 'a-█', '__proto__', 'constructor'])
    expect(value(policy.json(actual))).toEqual(actual)
    expect(Object.keys(input)[0]).toBe('secret')
  })

  it('strips all original denylist spellings before renaming, preserves arrays and empties', () => {
    const input: Record<string, string | string[]> = {
      X: ['', 'two', 'two', 'secret', 'Bearer xyz'],
      Empty: [],
      Blank: '',
      secret: ['one'],
      '█': ['two'],
      ' authorization ': 'unchanged',
      AUTHORIZATION: 'secret',
      Authorization: 'secret',
    }
    for (const name of baseline.credential_header_names)
      input[name.toUpperCase()] = ['one', '', 'two']
    Object.defineProperty(input, '__proto__', { value: 'plain', enumerable: true })
    const policy = bound('secret')
    const actual = value(policy.headers(input))
    const expected: Record<string, string | string[]> = {
      X: ['', 'two', 'two', '█', '█'],
      Empty: [],
      Blank: '',
      '██': ['one'],
      '█': ['two'],
      ' authorization ': 'unchanged',
    }
    Object.defineProperty(expected, '__proto__', { value: 'plain', enumerable: true })
    expect(actual).toEqual(expected)
    expect(Object.getPrototypeOf(actual)).toBe(null)
    expect(value(policy.headers(actual))).toEqual(actual)
    expect(actual.X).not.toBe(input.X)
    expect(Object.isFrozen(actual)).toBe(true)
    expect(Object.isFrozen(actual.X)).toBe(true)
    if (Array.isArray(input.X)) input.X.push('later')
    expect(actual.X).toEqual(['', 'two', 'two', '█', '█'])
    expect(value(policy.headers({}))).toEqual({})
  })

  it('config snapshot, closure and output do not alias caller-owned data', () => {
    const config = {
      credential_fragment_min_length: 8,
      credential_header_names: ['authorization'],
      credential_patterns: [{ kind: 'prefix-token', prefix: 'sk-', alphabet: 'key' }],
    } satisfies CredentialRedactionConfig
    const policy = createCredentialRedactionPolicy(config)
    config.credential_fragment_min_length = 64
    config.credential_header_names.splice(0)
    const definition = config.credential_patterns[0]
    if (definition !== undefined) definition.prefix = 'xx-'
    const redactor = value(policy.bind('abcdefghijk'))
    expect(value(redactor.text('abcdefgh sk-a'))).toBe('█ █')
    expect(value(redactor.headers({ Authorization: 'value' }))).toEqual({})
    expect(Object.keys(policy)).toEqual(['bind'])
    expect(Object.keys(redactor)).toEqual(['text', 'headers', 'json'])
    expect(Object.isFrozen(redactor)).toBe(true)
    const input = Object.freeze({ nested: Object.freeze([{ a: 'abcdefghijk' }]) })
    const actual = value(redactor.json(input))
    expect(actual).toEqual({ nested: [{ a: '█' }] })
    expect(Object.isFrozen(actual)).toBe(true)
  })
})

describe('explicit configuration and controlled admission', () => {
  it('baseline is exact, immutable, and explicit; generic empties are not production approval', () => {
    expect(baseline.credential_fragment_min_length).toBe(8)
    expect(baseline.credential_header_names).toEqual([
      'authorization',
      'proxy-authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'api-key',
      'apikey',
      'x-auth-token',
      'x-access-token',
      'x-openrouter-api-key',
      'x-amz-security-token',
    ])
    expect(baseline.credential_patterns).toEqual([
      { kind: 'prefix-token', prefix: 'sk-', alphabet: 'key' },
      { kind: 'scheme-token', scheme: 'bearer', alphabet: 'auth' },
      { kind: 'scheme-token', scheme: 'basic', alphabet: 'auth' },
    ])
    expect(Object.isFrozen(baseline)).toBe(true)
    expect(Object.isFrozen(baseline.credential_header_names)).toBe(true)
    expect(baseline.credential_patterns.every(Object.isFrozen)).toBe(true)
    expect(value(bound('tiny', generic(64)).text('tiny'))).toBe('█')
    expect(value(bound('tiny', generic(1)).text('t-i-n-y'))).toBe('█-█-█-█')
  })

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'baseline strengthening mechanics at m=%s retain original denylist and added patterns',
    minimum => {
      const config: CredentialRedactionConfig = {
        credential_fragment_min_length: minimum,
        credential_header_names: [...baseline.credential_header_names, 'x-added'],
        credential_patterns: [
          ...baseline.credential_patterns,
          { kind: 'prefix-token', prefix: 'api:', alphabet: 'auth' },
        ],
      }
      const policy = bound('zyxwvuts', config)
      expect(value(policy.text('api:ABC+/=!, Bearer ABC, sk-ABC, zyxwvuts'))).toBe('█!, █, █, █')
      expect(
        value(policy.headers({ AUTHORIZATION: 'discard', 'X-Added': ['', 'discard'], Kept: [] })),
      ).toEqual(minimum === 1 ? { 'Kep█': [] } : { Kept: [] })
    },
  )

  it('header stripping uses original names before any known-value rename and has no Unicode or trim folding', () => {
    const policy = bound('authorization')
    const actual = value(
      policy.headers({
        authorization: 'discard',
        Authorization: 'discard',
        ' authorization ': 'retained',
        'ſet-cookie': ['retained'],
      }),
    )
    expect(actual).toEqual({ ' █ ': 'retained', 'ſet-cookie': ['retained'] })
    expect(value(policy.headers(actual))).toEqual(actual)
  })

  const invalidConfigs: unknown[] = [
    undefined,
    null,
    { A: 1 },
    { ...baseline, credential_fragment_min_length: 0 },
    { ...baseline, credential_fragment_min_length: 65 },
    { ...baseline, credential_fragment_min_length: 1.5 },
    { ...baseline, credential_fragment_min_length: NaN },
    { ...baseline, extra: 'forbidden' },
    { ...baseline, credential_header_names: ['Authorization'] },
    { ...baseline, credential_header_names: ['authorization', 'authorization'] },
    { ...baseline, credential_header_names: [''] },
    { ...baseline, credential_header_names: [' a'] },
    { ...baseline, credential_header_names: ['a\n'] },
    { ...baseline, credential_header_names: ['ü'] },
    { ...baseline, credential_header_names: ['a'.repeat(129)] },
    { ...baseline, credential_header_names: Array.from({ length: 129 }, (_, i) => `x-${i}`) },
    { ...baseline, credential_patterns: [{ kind: 'regex', source: 'secret.*' }] },
    { ...baseline, credential_patterns: [{ kind: 'prefix-token', prefix: '', alphabet: 'key' }] },
    {
      ...baseline,
      credential_patterns: [{ kind: 'prefix-token', prefix: 'a'.repeat(65), alphabet: 'key' }],
    },
    { ...baseline, credential_patterns: [{ kind: 'prefix-token', prefix: '\n', alphabet: 'key' }] },
    {
      ...baseline,
      credential_patterns: [{ kind: 'prefix-token', prefix: 'a', alphabet: 'unknown' }],
    },
    {
      ...baseline,
      credential_patterns: [{ kind: 'scheme-token', scheme: 'bear er', alphabet: 'auth' }],
    },
    {
      ...baseline,
      credential_patterns: [{ kind: 'scheme-token', scheme: 'bearer1', alphabet: 'auth' }],
    },
    {
      ...baseline,
      credential_patterns: [{ kind: 'prefix-token', prefix: 'a', alphabet: 'key', flags: 'i' }],
    },
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
    { ...baseline, credential_patterns: [() => 'secret'] },
  ]
  it.each(invalidConfigs.map((input, index) => [index, input]))(
    'invalid static configuration #%s is controlled',
    (_index, input) => {
      expect(() => Reflect.apply(createCredentialRedactionPolicy, undefined, [input])).toThrow(
        CredentialRedactionConfigurationError,
      )
      expect(Reflect.apply(redact, undefined, ['safe', 'known', input])).toEqual({
        rejected: 'invalidInput',
      })
    },
  )

  it('getters, cycles, foreign reflection exceptions and toJSON never leak or execute', () => {
    let calls = 0
    const getter = Object.defineProperty({}, 'credential_fragment_min_length', {
      get() {
        calls++
        throw new Error('SYNTHETIC_SECRET')
      },
      enumerable: true,
    })
    const cycle: Record<string, unknown> = { ...baseline }
    cycle.self = cycle
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('SYNTHETIC_SECRET')
        },
      },
    )
    for (const input of [getter, cycle, proxy]) {
      try {
        Reflect.apply(createCredentialRedactionPolicy, undefined, [input])
        throw new Error('must reject')
      } catch (error) {
        expect(error).toBeInstanceOf(CredentialRedactionConfigurationError)
        if (!(error instanceof Error)) throw new Error('controlled Error expected')
        expect(error.message).toBe('Invalid credential redaction configuration')
        expect(Object.keys(error)).toEqual(['name'])
        expect('cause' in error).toBe(false)
      }
    }
    const policy = bound()
    for (const input of [
      getter,
      cycle,
      proxy,
      {
        toJSON() {
          calls++
          return 'secret'
        },
      },
      new Date(),
      NaN,
      {
        get value() {
          calls++
          return 'secret'
        },
      },
      Object.assign([], { extra: 'secret' }),
      Array(1),
      { [Symbol('s')]: 'secret' },
    ])
      expect(Reflect.apply(policy.json, undefined, [input])).toEqual({ rejected: 'invalidInput' })
    expect(calls).toBe(0)
  })

  it('numeric brands with foreign read accessors are rejected without invoking them', () => {
    let calls = 0
    class HostileNumber extends LosslessNumber {
      override get source(): string {
        calls++
        throw new Error('SYNTHETIC_SECRET')
      }
    }
    expect(bound().json(new HostileNumber('1'))).toEqual({ rejected: 'invalidInput' })
    expect(calls).toBe(0)
  })

  it('a branded numeric prototype Proxy cannot execute Get or replace the original numeric token', () => {
    let calls = 0
    class NumberWithProxyPrototype extends LosslessNumber {}
    const proxy = new Proxy(LosslessNumber.prototype, {
      get(target, key, receiver): unknown {
        if (key === 'source') {
          calls++
          return '9007199254740993123'
        }
        return Reflect.get(target, key, receiver)
      },
    })
    Object.setPrototypeOf(NumberWithProxyPrototype.prototype, proxy)
    const input = new NumberWithProxyPrototype('1')
    expect(LosslessNumber.is(input)).toBe(true)
    const retained = value(bound('never-known').json(input))
    if (!LosslessNumber.is(retained)) throw new Error('owned number expected')
    expect(jsonNumberSource(retained)).toBe('1')
    expect(value(bound('1').json(input))).toBe('█')
    expect(calls).toBe(0)
  })

  it('valid depth 20000 traverses iteratively, preserving shape and freezing each output', () => {
    let input: JsonValue = 'tiny'
    for (let index = 0; index < 20000; index++) input = [input]
    const policy = bound('tiny')
    const actual = value(policy.json(input))
    let item = value(policy.json(actual))
    for (let index = 0; index < 20000; index++) {
      if (!Array.isArray(item) || item.length !== 1 || item[0] === undefined)
        throw new Error('shape changed')
      expect(Object.isFrozen(item)).toBe(true)
      item = item[0]
    }
    expect(item).toBe('█')
  })

  it('an internal processing defect propagates as controlled Error rather than invalidInput or raw', () => {
    const policy = bound('tiny')
    vi.stubGlobal('Uint32Array', function unavailable() {
      throw new Error('SYNTHETIC_SECRET')
    })
    try {
      for (const operation of [
        () => policy.text('tiny'),
        () => policy.json('tiny'),
        () => policy.headers({ X: 'tiny' }),
        () => redact('tiny', 'tiny', baseline),
      ]) {
        expect(operation).toThrow('Credential redaction processing failed')
        try {
          operation()
        } catch (error) {
          if (!(error instanceof Error)) throw new Error('controlled Error expected')
          expect(error.message).not.toContain('SYNTHETIC_SECRET')
          expect('cause' in error).toBe(false)
        }
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each(['', '\n', '\x7f', 'ü', 'a\x00b'])(
    'invalid known credential %j returns invalidInput',
    credential => {
      expect(createCredentialRedactionPolicy(baseline).bind(credential)).toEqual({
        rejected: 'invalidInput',
      })
      expect(redact('safe', credential, baseline)).toEqual({ rejected: 'invalidInput' })
    },
  )

  it.each([0, false, null, { A: 1 }, [], [['nested']], { A: null }, { A: [1] }, { A: [['bad']] }])(
    'malformed headers or text remain controlled',
    input => {
      const policy = bound()
      expect(Reflect.apply(policy.headers, undefined, [input])).toEqual({
        rejected: 'invalidInput',
      })
      if (typeof input !== 'string')
        expect(Reflect.apply(policy.text, undefined, [input])).toEqual({ rejected: 'invalidInput' })
    },
  )

  it('S60 three-parameter public function shares JSON/string semantics', () => {
    expect(
      value(redact({ key: 'Bearer token', code: new LosslessNumber('12345') }, '234', baseline)),
    ).toEqual({ key: '█', code: '█' })
    expect(value(redact('prefix tiny suffix', 'tiny', baseline))).toBe('prefix █ suffix')
    expect(Reflect.apply(redact, undefined, ['tiny', 'tiny'])).toEqual({ rejected: 'invalidInput' })
    expect(Reflect.apply(redact, undefined, ['tiny'])).toEqual({ rejected: 'invalidInput' })
  })
})
