import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { validate } from '@omne-harness-lite/tool-definition'
import { retryDelay, type RetryDelayInput } from '../src/index.ts'
import { retryDelayVectors } from './retry-delay-vectors.ts'

const policy = {
  kind: 'exponential',
  base: 'PT10S',
  factor: 2,
  max: 'PT100S',
  jitter: 'none',
} as const
const ordinary: RetryDelayInput = { policy, n: 3, uniformSample: 0.5 }
const malformed = { invalidInput: { reason: 'malformed' } }
function unknownInput(input: unknown): unknown {
  return Reflect.apply(retryDelay, undefined, [input])
}

describe('S60 exact retry delay, with TD3 durations', () => {
  it.each(retryDelayVectors)('$name', ({ input, expected }) => {
    const before = writeJsonLossless(input)
    const result = retryDelay(input)
    expect(result).toEqual({ ok: expected })
    expect(validate('Duration', expected).valid).toBe(true)
    expect(retryDelay(input)).toEqual(result)
    expect(writeJsonLossless(input)).toBe(before)
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('owns the returned value while leaving caller data mutable', () => {
    const input: RetryDelayInput = { policy: { ...policy }, n: 3, uniformSample: 0.5 }
    const before = retryDelay(input)
    Object.assign(input.policy, { base: 'PT1S' })
    Object.assign(input, { uniformSample: 0.25 })
    expect(before).toEqual({ ok: 'PT40S' })
    expect(retryDelay(input)).toEqual({ ok: 'PT4S' })
  })
})

describe('S60 malformed reception has no defaults', () => {
  it.each(['kind', 'base', 'factor', 'max', 'jitter'])('missing policy member %s', key => {
    const changed: Record<string, unknown> = { ...policy }
    delete changed[key]
    expect(unknownInput({ ...ordinary, policy: changed })).toEqual(malformed)
  })
  it.each(['policy', 'n', 'uniformSample'])('missing fact %s', key => {
    const changed: Record<string, unknown> = { ...ordinary }
    delete changed[key]
    expect(unknownInput(changed)).toEqual(malformed)
  })
  it.each([
    ['kind', 'cubic'],
    ['jitter', 'random'],
    ['jitter', ''],
    ['kind', null],
    ['factor', 0.999],
    ['factor', new LosslessNumber('0.999999999999999999999999999999')],
    ['factor', -1],
    ['factor', NaN],
    ['factor', Infinity],
    ['factor', '2'],
    ['base', 'P1D'],
    ['base', 'PT-1S'],
    ['base', 'PT1.5M'],
    ['base', 'PT1S\n'],
    ['base', 'PT'],
    ['base', 'PTNaNS'],
    ['max', 'PTInfinityS'],
    ['max', -1],
    ['max', 'PT1M1H'],
    ['max', 'PT1S '],
    ['max', null],
  ])('illegal policy %s=%s', (key, value) => {
    expect(unknownInput({ ...ordinary, policy: { ...policy, [key]: value } })).toEqual(malformed)
  })
  it.each([0, -1, 0.1, new LosslessNumber('1e-10000'), NaN, Infinity, '3', null, 3n])(
    'illegal n %s',
    n => {
      expect(unknownInput({ ...ordinary, n })).toEqual(malformed)
    },
  )
  it.each([
    -0.1,
    1,
    new LosslessNumber('1.000000000000000000000000000001'),
    NaN,
    Infinity,
    '0.5',
    null,
  ])('illegal sample %s', uniformSample => {
    expect(unknownInput({ ...ordinary, uniformSample })).toEqual(malformed)
  })
  it.each([undefined, 'PT9S', 'PT-10S', 'P1D', null, Infinity])(
    'decorrelated first previous %s',
    previousDelay => {
      expect(
        unknownInput({
          ...ordinary,
          policy: { ...policy, jitter: 'decorrelated' },
          n: 1,
          ...(previousDelay === undefined ? {} : { previousDelay }),
        }),
      ).toEqual(malformed)
    },
  )
  it('rejects extra policy and input members including seed or retry count', () => {
    for (const extra of [{ seed: 123 }, { retries: 3 }, { previousDelay: 'PT10S' }]) {
      expect(unknownInput({ ...ordinary, policy: { ...policy, ...extra } })).toEqual(malformed)
      expect(unknownInput({ ...ordinary, ...extra })).toEqual(malformed)
    }
  })
  it('rejects getters without reading them, at both boundaries', () => {
    let calls = 0
    const getter = {
      enumerable: true,
      get() {
        calls++
        return policy
      },
    }
    const top = { n: 3, uniformSample: 0.5 }
    Object.defineProperty(top, 'policy', getter)
    const nested = { ...policy }
    Object.defineProperty(nested, 'factor', getter)
    expect(unknownInput(top)).toEqual(malformed)
    expect(unknownInput({ ...ordinary, policy: nested })).toEqual(malformed)
    expect(calls).toBe(0)
  })
  it('rejects non-JSON shapes without calling toJSON', () => {
    let calls = 0
    const cycle: Record<string, unknown> = { ...ordinary }
    cycle.self = cycle
    const inputs: unknown[] = [
      undefined,
      null,
      [],
      new Date(0),
      {
        ...ordinary,
        toJSON() {
          calls++
          return ordinary
        },
      },
      cycle,
      { ...ordinary, [Symbol('hidden')]: 1 },
      { ...ordinary, policy: Object.create(policy) },
      { ...ordinary, uniformSample: () => 0.5 },
    ]
    for (const input of inputs) expect(unknownInput(input)).toEqual(malformed)
    expect(calls).toBe(0)
  })
})
