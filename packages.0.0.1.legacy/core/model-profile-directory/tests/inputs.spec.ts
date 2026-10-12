import { LosslessNumber, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { describe, expect, it } from 'vitest'
import {
  invalid,
  isContent,
  isRef,
  jsonObject,
  object,
  parseContent,
  parseManifest,
  parsePatch,
  parseRef,
  positiveOrdinal,
} from '../src/index.ts'
import { content, tenant } from './fixtures.ts'

describe('directory JSON input boundaries', () => {
  it('separates object shape from profile/reference validity', () => {
    expect(object({})).toBe(true)
    expect(object(Object.create(null))).toBe(true)
    expect(jsonObject({ nested: [1] })).toBe(true)
    for (const value of [null, [], 1, new LosslessNumber('1'), 'x']) {
      expect(object(value)).toBe(false)
      expect(jsonObject(value)).toBe(false)
    }
    expect(isContent(content)).toBe(true)
    expect(isContent({ ...content, registration: 'listed' })).toBe(false)
    expect(isRef({ origin: 'official', routeName: content.routeName })).toBe(true)
    expect(isRef({ origin: 'custom', routeName: content.routeName })).toBe(false)
    expect(invalid()).toEqual({ failure: 'invalidInput', reason: 'malformed' })
    expect(invalid('route_name_empty')).toEqual({
      failure: 'invalidInput',
      reason: 'route_name_empty',
    })
  })

  it('copies and freezes accepted content without rounding decimal parameters', () => {
    const precise = new LosslessNumber('0.123456789012345678901')
    const input = { ...content, providers: ['provider'], parameters: { temperature: precise } }
    const parsed = parseContent(input)
    expect(parsed).toEqual(input)
    expect(parsed).not.toBe(input)
    if ('failure' in parsed) throw new Error('expected valid content')
    expect(parsed.providers).not.toBe(input.providers)
    expect(parsed.parameters?.temperature).toBe(precise)
    expect(writeJsonLossless(parsed)).toBe(writeJsonLossless(input))
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed.providers)).toBe(true)
    expect(Object.isFrozen(parsed.adaptation.configuration.values)).toBe(true)
    input.providers.push('later')
    expect(parsed.providers).toEqual(['provider'])
  })

  it.each([
    [{ ...content, routeName: '' }, 'route_name_empty'],
    [{ ...content, providers: [] }, 'providers_empty'],
    [{ ...content, registration: 'listed' }, 'malformed'],
    [{ ...content, parameters: { maxOutputTokens: 8193 } }, 'max_output_exceeds_profile'],
  ])('preserves the profile rejection reason for %j', (input, reason) => {
    expect(parseContent(input)).toEqual({ failure: 'invalidInput', reason })
  })

  it('rejects non-JSON data without invoking accessors', () => {
    const reads: string[] = []
    const input = {
      ...content,
      get parameters() {
        reads.push('getter')
        return {}
      },
    }
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    for (const value of [undefined, new Date(), cycle, input]) {
      expect(parseContent(value)).toEqual(invalid())
      expect(parseRef(value)).toEqual(invalid())
      expect(parseManifest(value)).toEqual(invalid())
      expect(parsePatch(value)).toEqual(invalid())
    }
    expect(reads).toEqual([])
  })

  it('accepts closed official and custom references and copies their scope', () => {
    const official = { origin: 'official', routeName: content.routeName }
    const custom = {
      origin: 'custom',
      routeName: content.routeName,
      scope: { layer: 'tenant', tenant: tenant() },
    }
    expect(parseRef(official)).toEqual(official)
    const copied = parseRef(custom)
    expect(copied).toEqual(custom)
    expect(copied).not.toBe(custom)
    expect(Object.isFrozen(copied)).toBe(true)
    expect(parseRef({ ...official, scope: custom.scope })).toEqual(invalid())
    expect(parseRef({ ...custom, routeName: '' })).toEqual(invalid('route_name_empty'))
  })
})

describe('official manifest input', () => {
  it.each([
    [1, true],
    [0, false],
    [-0, false],
    [-1, false],
    [1.5, false],
    [Infinity, false],
    [new LosslessNumber('1e1000000'), true],
    [new LosslessNumber('1.00'), true],
    [new LosslessNumber('1.20e1'), true],
    [new LosslessNumber('1.20'), false],
    [new LosslessNumber('-0e100'), false],
    [new LosslessNumber('0.0e-100'), false],
    [new LosslessNumber('-1e100'), false],
    ['1', false],
  ])('checks the exact positive ordinal %j', (value, accepted) => {
    expect(positiveOrdinal(value)).toBe(accepted)
  })

  it('accepts empty and populated manifests with exact ordinals and detached entries', () => {
    const ordinal = new LosslessNumber('9007199254740993')
    expect(parseManifest({ ordinal, entries: [] })).toEqual({ ordinal, entries: [] })
    const input = { ordinal, entries: [content] }
    const parsed = parseManifest(input)
    expect(parsed).toEqual(input)
    if ('failure' in parsed) throw new Error('expected manifest')
    expect(parsed.ordinal).toBe(ordinal)
    expect(parsed.entries).not.toBe(input.entries)
    expect(parsed.entries[0]).not.toBe(content)
    expect(Object.isFrozen(parsed.entries[0])).toBe(true)
  })

  it.each([
    { ordinal: 1, entries: [], extra: true },
    { ordinal: 1 },
    { ordinal: 0, entries: [] },
    { ordinal: 1, entries: {} },
    { ordinal: 1, entries: [{ ...content, origin: 'custom' }] },
    { ordinal: 1, entries: [content, content] },
  ])('rejects malformed or duplicate manifest %j', value => {
    expect(parseManifest(value)).toEqual(invalid())
  })

  it('propagates the first invalid profile reason and leaves the input unchanged', () => {
    const input = { ordinal: 1, entries: [{ ...content, routeName: '' }, content] }
    const before = writeJsonLossless(input)
    expect(parseManifest(input)).toEqual(invalid('route_name_empty'))
    expect(writeJsonLossless(input)).toBe(before)
  })
})

describe('profile patch structural parsing', () => {
  it.each([
    { replace: { parameters: { temperature: 1 } } },
    { remove: ['parameters'] },
    { replace: {}, remove: ['parameters'] },
    { replace: { adaptation: content.adaptation } },
    { replace: { maxInputTokens: -1 } },
  ])('copies accepted patch structure %j without applying the merged profile', value => {
    const copied = parsePatch(value)
    expect(copied).toEqual(value)
    expect(copied).not.toBe(value)
    expect(Object.isFrozen(copied)).toBe(true)
  })

  it.each([
    {},
    [],
    { replace: {} },
    { extra: true },
    { replace: null },
    { replace: { routeName: 'other' } },
    { remove: [] },
    { remove: ['providers'] },
    { remove: ['parameters', 'parameters'] },
    { replace: { adaptation: { implementation: {} } } },
  ])('rejects invalid patch structure %j', value => {
    expect(parsePatch(value)).toEqual(invalid())
  })
})
