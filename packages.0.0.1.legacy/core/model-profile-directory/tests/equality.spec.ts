import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { describe, expect, it } from 'vitest'
import { contentEqual, jsonEqual, upstreamEqual } from '../src/index.ts'
import { content, row } from './fixtures.ts'

describe('exact directory comparison', () => {
  it.each([
    [new LosslessNumber('1.00'), new LosslessNumber('1e0'), true],
    [new LosslessNumber('1.20e1'), 12, true],
    [new LosslessNumber('1e1000000'), new LosslessNumber('10e999999'), true],
    [new LosslessNumber('-0e1000000'), 0, true],
    [new LosslessNumber('-12.0'), new LosslessNumber('-1.2e1'), true],
    [new LosslessNumber('9007199254740992'), new LosslessNumber('9007199254740993'), false],
    [new LosslessNumber('1'), '1', false],
    [new LosslessNumber('-1'), new LosslessNumber('1'), false],
  ])('compares decimal values %j and %j without conversion', (a, b, expected) => {
    expect(jsonEqual(a, b)).toBe(expected)
    expect(jsonEqual(b, a)).toBe(expected)
  })

  it.each([
    [null, null, true],
    [null, {}, false],
    [undefined, undefined, true],
    [true, false, false],
    ['a', 'b', false],
    [[1, 2], [1, 2], true],
    [[1, 2], [2, 1], false],
    [[1], [1, 2], false],
    [[1], { 0: 1 }, false],
    [{ x: 1 }, { y: 1 }, false],
    [{ x: 1 }, { x: 1, y: 2 }, false],
    [{ a: [1, { b: null }], c: true }, { c: true, a: [1, { b: null }] }, true],
  ])('preserves JSON identity, array order and object keys', (a, b, expected) => {
    expect(jsonEqual(a, b)).toBe(expected)
    expect(jsonEqual(b, a)).toBe(expected)
  })

  it('treats modalities as sets, while comparing all caps and facts exactly', () => {
    const a = {
      ...content,
      inputModalities: ['text', 'image'] as const,
      outputModalities: ['text', 'image'] as const,
    }
    expect(
      upstreamEqual(a, {
        ...a,
        inputModalities: ['image', 'text'],
        outputModalities: ['image', 'text'],
      }),
    ).toBe(true)
    expect(upstreamEqual(a, { ...a, inputModalities: ['text'] })).toBe(false)
    expect(upstreamEqual(a, { ...a, outputModalities: ['text'] })).toBe(false)
    expect(upstreamEqual(a, { ...a, maxInputTokens: 32001 })).toBe(false)
    expect(upstreamEqual(a, { ...a, maxOutputTokens: 8193 })).toBe(false)
    expect(upstreamEqual(a, { ...a, inputConstraints: { maxImages: 1 } })).toBe(false)
    expect(
      upstreamEqual(a, {
        ...a,
        upstreamInputLimits: {
          ...a.upstreamInputLimits,
          maxRequestBytes: { status: 'unbounded' },
        },
      }),
    ).toBe(false)
    expect(upstreamEqual(a, { ...a, maxInputTokens: new LosslessNumber('32000.00') })).toBe(true)
  })

  it('includes selection and adaptation content, but excludes row lifecycle metadata', () => {
    expect(contentEqual(content, { ...content })).toBe(true)
    const withdrawn = {
      ...row().profile,
      registration: 'withdrawn' as const,
      updatedAt: '2026-10-09T01:00:00Z',
    }
    expect(contentEqual(row().profile, withdrawn)).toBe(true)
    expect(contentEqual(content, { ...content, routeName: 'other' })).toBe(false)
    expect(contentEqual(content, { ...content, origin: 'custom' })).toBe(false)
    expect(contentEqual(content, { ...content, providers: ['other'] })).toBe(false)
    expect(contentEqual(content, { ...content, allowFallback: true })).toBe(false)
    expect(contentEqual(content, { ...content, parameters: {} })).toBe(false)
    expect(
      contentEqual(content, {
        ...content,
        adaptation: { ...content.adaptation, configuration: { revision: '2', values: {} } },
      }),
    ).toBe(false)
    expect(
      contentEqual(
        { ...content, parameters: { temperature: new LosslessNumber('1.0') } },
        { ...content, parameters: { temperature: 1 } },
      ),
    ).toBe(true)
  })
})
