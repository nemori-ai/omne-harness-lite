import { describe, expect, it } from 'vitest'
import { usageProtocol } from '@omne-harness/usage-protocol'

const NAMES = ['query-usage', 'list-usage-records', 'read-context-occupancy'] as const

describe('usage/v1', () => {
  it('is usage major 1 with the three reads and no observation', () => {
    expect(usageProtocol.name).toBe('usage')
    expect(usageProtocol.major).toBe(1)
    expect(Object.keys(usageProtocol.operations)).toEqual([...NAMES])
    expect(Object.keys(usageProtocol.observations)).toEqual([])
  })

  it.each(NAMES)('%s is a login read of the small limit that counts as access', name => {
    const operation = usageProtocol.operations[name]
    expect({
      identity: operation.identity,
      effect: operation.effect,
      limit: operation.limit,
      countsAsAccess: operation.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true })
    expect('carriesCredential' in operation).toBe(false)
  })

  it.each(NAMES)('%s answers the same refusals of its own and the fixed outcomes', name => {
    const outcomes = usageProtocol.operations[name].outcomes
    expect(Object.keys(outcomes).sort()).toEqual(
      [
        'basis-unavailable',
        'denied',
        'invalid',
        'limited',
        'not-found',
        'protocol-rejected',
        'succeeded',
        'unsupported',
      ].sort(),
    )
    for (const fixed of ['protocol-rejected', 'basis-unavailable', 'denied'] as const)
      expect(outcomes[fixed]).toBe(true)
  })
})
