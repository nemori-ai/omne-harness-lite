import { describe, expect, it } from 'vitest'

import {
  pendingLimitOf,
  sessionIntakeItems,
  sessionIntakeSettings,
} from '../src/intake-settings.ts'

function basisOf(sources: unknown, definition: unknown = sessionIntakeSettings) {
  return { views: [{ definition, state: { sources } }] }
}
function tenantSets(value: unknown) {
  return [
    {
      id: 'tenant',
      values: [
        { itemId: sessionIntakeItems.pendingLimit, value: { kind: 'value', value }, locked: false },
      ],
    },
  ]
}

describe('the pending limit a settings read gives', () => {
  it('is the declared default when the tenant set nothing', () => {
    expect(pendingLimitOf(basisOf([]))).toBe(64)
  })

  it('is the value the tenant set', () => {
    expect(pendingLimitOf(basisOf(tenantSets(1)))).toBe(1)
    expect(pendingLimitOf(basisOf(tenantSets(4096)))).toBe(4096)
  })

  it('is null when the read carries no single view', () => {
    for (const basis of [null, undefined, 'text', {}, { views: 'none' }, { views: [] }])
      expect(pendingLimitOf(basis)).toBeNull()
    const two = basisOf([])
    expect(pendingLimitOf({ views: [...two.views, ...two.views] })).toBeNull()
    expect(pendingLimitOf({ views: [{ definition: sessionIntakeSettings }] })).toBeNull()
  })

  it('is null when the sources do not evaluate to a complete result', () => {
    expect(pendingLimitOf(basisOf(tenantSets(0)))).toBeNull()
    expect(pendingLimitOf(basisOf(tenantSets('many')))).toBeNull()
    expect(pendingLimitOf(basisOf('not sources'))).toBeNull()
  })

  it('is null when the definition has no pending limit', () => {
    const other = structuredClone(sessionIntakeSettings) as { items: { id: string }[] }
    other.items[0]!.id = 'something-else'
    expect(pendingLimitOf(basisOf([], other))).toBeNull()
  })
})
