import { describe, expect, it } from 'vitest'
import { sourceFailureTo } from '../src/mapping.ts'

describe('sourceFailureTo for the snapshot of read and list', () => {
  it.each([
    ['unavailable', { kind: 'source-unavailable' }],
    ['entry-unreadable', { kind: 'source-unavailable' }],
    ['outside-package', { kind: 'outside-package' }],
    ['entry-not-found', { kind: 'source-unavailable' }],
    ['bytes-mismatch', { kind: 'source-unavailable' }],
  ] as const)('%s → %j with and without a basis', (failure, expected) => {
    expect(sourceFailureTo('snapshot', failure, false)).toStrictEqual(expected)
    expect(sourceFailureTo('snapshot', failure, true)).toStrictEqual(expected)
  })

  it('maps package-not-found by whether the operation has a basis', () => {
    expect(sourceFailureTo('snapshot', 'package-not-found', true)).toStrictEqual({
      kind: 'basis-unavailable',
    })
    expect(sourceFailureTo('snapshot', 'package-not-found', false)).toStrictEqual({
      kind: 'source-unavailable',
    })
  })
})

describe('sourceFailureTo for the open of read', () => {
  it.each([
    ['entry-not-found', { kind: 'resource-missing' }],
    ['unavailable', { kind: 'source-unavailable' }],
    ['entry-unreadable', { kind: 'source-unavailable' }],
    ['bytes-mismatch', { kind: 'version-changed' }],
    ['outside-package', { kind: 'outside-package' }],
  ] as const)('%s → %j with and without a basis', (failure, expected) => {
    expect(sourceFailureTo('open', failure, false)).toStrictEqual(expected)
    expect(sourceFailureTo('open', failure, true)).toStrictEqual(expected)
  })

  it('maps package-not-found by whether the operation has a basis', () => {
    expect(sourceFailureTo('open', 'package-not-found', true)).toStrictEqual({
      kind: 'basis-unavailable',
    })
    expect(sourceFailureTo('open', 'package-not-found', false)).toStrictEqual({
      kind: 'source-unavailable',
    })
  })
})
