// The one table from a source answer to a service failure: three columns, one for `inspect`,
// one for the `snapshot` call and one for the `open` call of the byte-reading operations.
// Every row is pinned here; the inspection and access tests show that the services go
// through this table.
import { describe, expect, it } from 'vitest'
import { sourceFailureTo } from '../src/mapping.ts'

describe('sourceFailureTo for inspect', () => {
  it.each([
    ['package-not-found', { kind: 'source-unavailable' }],
    ['entry-not-found', { kind: 'source-unavailable' }],
    ['unavailable', { kind: 'source-unavailable' }],
    ['bytes-mismatch', { kind: 'version-changed' }],
    ['entry-unreadable', { kind: 'rejected', code: 'malformed' }],
    ['outside-package', { kind: 'rejected', code: 'outside-package' }],
  ] as const)('%s → %j', (failure, expected) => {
    expect(sourceFailureTo('inspect', failure)).toMatchObject(expected)
  })
})

describe('sourceFailureTo for the snapshot of read, list and export', () => {
  it.each([
    ['unavailable', { kind: 'source-unavailable' }],
    ['entry-unreadable', { kind: 'source-unavailable' }],
    ['outside-package', { kind: 'outside-package' }],
    // A snapshot does not answer about one entry; a source that does is not usable.
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

describe('sourceFailureTo for the open of read and export', () => {
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
