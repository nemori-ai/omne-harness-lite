// The one table from a source answer to a service failure. Every row is pinned here; the
// inspection and access tests show that the services go through this table.
import { describe, expect, it } from 'vitest'
import type { SourceFailure } from '@omne-harness/skill-contract/provider'
import { sourceFailureTo } from '../src/mapping.ts'

const FAILURES: readonly SourceFailure[] = [
  'package-not-found',
  'entry-not-found',
  'bytes-mismatch',
  'outside-package',
  'unavailable',
  'entry-unreadable',
]

describe('sourceFailureTo for inspect', () => {
  it.each([
    ['package-not-found', { kind: 'source-unavailable' }],
    ['entry-not-found', { kind: 'source-unavailable' }],
    ['unavailable', { kind: 'source-unavailable' }],
    ['bytes-mismatch', { kind: 'version-changed' }],
    ['entry-unreadable', { kind: 'rejected', code: 'malformed' }],
    ['outside-package', { kind: 'rejected', code: 'outside-package' }],
  ] as const)('%s → %j', (failure, expected) => {
    expect(sourceFailureTo('inspect', failure, false)).toMatchObject(expected)
    expect(sourceFailureTo('inspect', failure, true)).toMatchObject(expected)
  })

  it('covers every source failure', () => {
    for (const failure of FAILURES) expect(sourceFailureTo('inspect', failure, false)).toBeDefined()
  })
})

describe('sourceFailureTo for read, list and export', () => {
  it.each([
    ['entry-not-found', { kind: 'resource-missing' }],
    ['unavailable', { kind: 'source-unavailable' }],
    ['entry-unreadable', { kind: 'source-unavailable' }],
    ['bytes-mismatch', { kind: 'version-changed' }],
    ['outside-package', { kind: 'outside-package' }],
  ] as const)('%s → %j with and without a basis', (failure, expected) => {
    expect(sourceFailureTo('access', failure, false)).toEqual(expected)
    expect(sourceFailureTo('access', failure, true)).toEqual(expected)
  })

  it('maps package-not-found by whether the operation has a basis', () => {
    expect(sourceFailureTo('access', 'package-not-found', true)).toEqual({
      kind: 'basis-unavailable',
    })
    expect(sourceFailureTo('access', 'package-not-found', false)).toEqual({
      kind: 'source-unavailable',
    })
  })
})
