import { describe, expect, it } from 'vitest'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'

const operation = sessionDiagnosticsProtocol.operations['read-session-diagnostics']

describe('session-diagnostics/v1', () => {
  it('is session-diagnostics major 1 with exactly one operation and no observation', () => {
    expect(sessionDiagnosticsProtocol.name).toBe('session-diagnostics')
    expect(sessionDiagnosticsProtocol.major).toBe(1)
    expect(Object.keys(sessionDiagnosticsProtocol.operations)).toEqual(['read-session-diagnostics'])
    expect(Object.keys(sessionDiagnosticsProtocol.observations)).toEqual([])
  })

  it('read-session-diagnostics is a login read of the small limit that counts as access', () => {
    expect({
      identity: operation.identity,
      effect: operation.effect,
      limit: operation.limit,
      countsAsAccess: operation.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'read', limit: 'small', countsAsAccess: true })
    expect('carriesCredential' in operation).toBe(false)
  })

  it('answers succeeded and invalid of its own, and the fixed outcomes', () => {
    expect(Object.keys(operation.outcomes).sort()).toEqual(
      ['basis-unavailable', 'denied', 'invalid', 'protocol-rejected', 'succeeded'].sort(),
    )
    for (const fixed of ['protocol-rejected', 'basis-unavailable', 'denied'] as const)
      expect(operation.outcomes[fixed]).toBe(true)
  })
})
