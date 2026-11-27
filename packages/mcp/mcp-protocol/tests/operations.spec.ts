import { describe, expect, it } from 'vitest'
import { mcpProtocol } from '@omne-harness/mcp-protocol'

const { operations } = mcpProtocol

describe('mcp/v1', () => {
  it('is mcp major 1 with the three operations and the one observation', () => {
    expect(mcpProtocol.name).toBe('mcp')
    expect(mcpProtocol.major).toBe(1)
    expect(Object.keys(operations)).toEqual(['list-endpoints', 'read-endpoint', 'refresh-endpoint'])
    expect(Object.keys(mcpProtocol.observations)).toEqual(['observe-endpoints'])
  })

  it('observe-endpoints came at revision 2, wants a login and has no end of its own', () => {
    const observation = mcpProtocol.observations['observe-endpoints']
    expect({
      identity: observation.identity,
      since: observation.since,
      ends: observation.ends,
    }).toEqual({ identity: 'login', since: 2, ends: [] })
  })

  it('the two reads are login reads and the refresh is a login commit, all of the small limit', () => {
    const shape = (name: keyof typeof operations) => ({
      identity: operations[name].identity,
      effect: operations[name].effect,
      limit: operations[name].limit,
    })
    expect(shape('list-endpoints')).toEqual({ identity: 'login', effect: 'read', limit: 'small' })
    expect(shape('read-endpoint')).toEqual({ identity: 'login', effect: 'read', limit: 'small' })
    expect(shape('refresh-endpoint')).toEqual({
      identity: 'login',
      effect: 'commit',
      limit: 'small',
    })
  })

  it('answers each operation with exactly its own outcomes and the fixed ones', () => {
    const outcomes = (name: keyof typeof operations) =>
      Object.keys(operations[name].outcomes).sort()
    expect(outcomes('list-endpoints')).toEqual(
      ['basis-unavailable', 'denied', 'protocol-rejected', 'succeeded'].sort(),
    )
    expect(outcomes('read-endpoint')).toEqual(
      ['basis-unavailable', 'denied', 'not-visible', 'protocol-rejected', 'succeeded'].sort(),
    )
    expect(outcomes('refresh-endpoint')).toEqual(
      [
        'basis-unavailable',
        'denied',
        'not-visible',
        'protocol-rejected',
        'succeeded',
        'unknown',
      ].sort(),
    )
  })
})
