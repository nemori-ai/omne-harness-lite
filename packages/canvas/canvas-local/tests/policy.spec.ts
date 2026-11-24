import { describe, expect, it } from 'vitest'
import { CanvasPolicyError, canvasPolicySchema, parsePolicy } from '../src/policy.ts'
import { POLICY } from './fixture.ts'

describe('the policy of the canvas', () => {
  it('takes every value it runs on', () => {
    expect(canvasPolicySchema.parse(POLICY)).toEqual(POLICY)
  })

  it.each([
    ['missing', undefined],
    ['without the sheet', { ...POLICY, sheet: undefined }],
    ['without the time limit of admit', { ...POLICY, admitTimeoutMs: undefined }],
    ['with a limit of zero', { ...POLICY, limits: { ...POLICY.limits, placed: 0 } }],
    [
      'with a grid larger than the sheet',
      { ...POLICY, sheet: { width: 100, height: 100, grid: 101 } },
    ],
    [
      'with the least size above the most',
      { ...POLICY, size: { min: { width: 901, height: 64 }, max: POLICY.size.max } },
    ],
    [
      'with a most size larger than the sheet',
      { ...POLICY, sheet: { width: 800, height: 3200, grid: 8 } },
    ],
    ['with a footprint outside the sizes', { ...POLICY, footprint: { width: 100, height: 80 } }],
    ['with a value it does not know', { ...POLICY, zoom: 2 }],
  ])('refuses one %s', (_label, input) => {
    expect(canvasPolicySchema.safeParse(input).success).toBe(false)
    expect(() => parsePolicy(input)).toThrow(CanvasPolicyError)
  })
})

describe('the edges of the policy', () => {
  it('parses a policy it takes into the values it runs on', () => {
    expect(parsePolicy(POLICY)).toEqual(POLICY)
  })

  it('takes a policy whose bounds meet: one size, the footprint that size, the most size the sheet, the grid the side of the sheet', () => {
    const one = { width: 400, height: 300 }
    const policy = {
      ...POLICY,
      sheet: { width: 400, height: 300, grid: 300 },
      size: { min: one, max: one },
      footprint: one,
    }
    expect(parsePolicy(policy)).toEqual(policy)
  })

  it.each([
    [
      'with the least height above the most',
      { ...POLICY, size: { min: { width: 120, height: 901 }, max: POLICY.size.max } },
    ],
    [
      'with a grid larger than the height of the sheet only',
      { ...POLICY, sheet: { ...POLICY.sheet, grid: 3300 } },
    ],
    ['with a footprint above the most size', { ...POLICY, footprint: { width: 160, height: 901 } }],
  ])('refuses one %s', (_label, input) => {
    expect(() => parsePolicy(input)).toThrow(CanvasPolicyError)
  })
})
