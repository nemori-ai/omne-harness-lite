import { describe, expect, it } from 'vitest'
import { accessProtocol, type GovernanceCodecLimits } from '@omne-harness/public-contract'

const limits: GovernanceCodecLimits = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 1_000,
  maxMembers: 100,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

describe('access/v1', () => {
  it('is named access, major 1, with no operation and only the availability observation', () => {
    expect([accessProtocol.name, accessProtocol.major]).toEqual(['access', 1])
    expect(Object.keys(accessProtocol.operations)).toEqual([])
    expect(Object.keys(accessProtocol.observations)).toEqual(['availability'])
  })

  it('needs no login and has no end reason of its own', () => {
    const { availability } = accessProtocol.observations
    expect(availability.identity).toBe('none')
    expect(availability.ends).toEqual([])
  })

  it('opens with an empty object and nothing else', () => {
    const { open } = accessProtocol.observations.availability
    expect(open.write({}, limits)).toEqual({ ok: true, value: { kind: 'object', entries: [] } })
    expect(open.read({ kind: 'object', entries: [] }, limits)).toEqual({ ok: true, value: {} })
    expect(open.write([] as never, limits).ok).toBe(false)
    expect(open.read({ kind: 'array', items: [] }, limits).ok).toBe(false)
  })
})
