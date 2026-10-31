import { describe, expect, it } from 'vitest'
import {
  readGovernanceRequest,
  readGovernanceResponse,
  encodeGovernanceRequest,
  encodeGovernanceResponse,
} from '@omne-harness/public-contract'
import { GOVERNANCE_LIMITS, runGovernance } from '../src/governance.ts'
import { GOVERNANCE_SCENARIOS } from '../src/scenarios.ts'

const bytes = (value: string) => new TextEncoder().encode(value)

describe('public governance consumer', () => {
  it('executes each fixed positive and boundary scenario once', () => {
    const results = runGovernance()
    expect(results.map(result => result.scenarioId)).toEqual([...GOVERNANCE_SCENARIOS])
    expect(results.every(result => result.status === 'executed' && result.matchesExpected)).toBe(
      true,
    )
  })

  it('detects a valid response associated with another message', () => {
    const results = runGovernance({
      registrationResponseBytes: bytes(
        '{"protocolVersion":"governance-public/1","messageId":"other","outcome":"not-loginable","body":{}}',
      ),
    })
    expect(results.find(result => result.scenarioId === 'G1-register')).toMatchObject({
      status: 'executed',
      matchesExpected: false,
    })
    expect(results.find(result => result.scenarioId === 'G1-login')?.matchesExpected).toBe(true)
  })

  it('retains unreadable and exceptional public inputs as failures', () => {
    expect(runGovernance({ registrationResponseBytes: bytes('{') })[0]).toMatchObject({
      matchesExpected: false,
    })
    const invalidBytes = new Proxy(new Uint8Array(), {})
    expect(runGovernance({ registrationResponseBytes: invalidBytes })[0]).toMatchObject({
      status: 'exception',
      matchesExpected: false,
    })
  })

  it('uses local proof variants while the wire contains only loginProof', () => {
    for (const kind of ['missing', 'empty', 'present'] as const) {
      const proof = kind === 'present' ? { kind, value: 'test-only-proof' } : { kind }
      const encoded = encodeGovernanceRequest({
        request: {
          protocolVersion: 'governance-public/1',
          messageId: 'proof',
          operation: 'query-current-tenant',
          proof,
          body: {},
        },
        limits: GOVERNANCE_LIMITS,
      })
      expect(encoded.kind).toBe('encoded')
      if (encoded.kind !== 'encoded') throw new Error('Encoding failed')
      const text = new TextDecoder().decode(encoded.bytes)
      expect(text).not.toContain('"proof":')
      expect(text.includes('loginProof')).toBe(kind !== 'missing')
      const read = readGovernanceRequest({ bytes: encoded.bytes, limits: GOVERNANCE_LIMITS })
      expect(read).toMatchObject({ kind: 'request', request: { proof } })
    }
  })

  it('keeps unknown correlated and empty without promoting it to success', () => {
    const encoded = encodeGovernanceResponse({
      operation: 'create-organization',
      response: {
        protocolVersion: 'governance-public/1',
        messageId: 'unknown',
        outcome: 'unknown',
        body: {},
      },
      limits: GOVERNANCE_LIMITS,
    })
    if (encoded.kind !== 'encoded') throw new Error('Encoding failed')
    expect(
      readGovernanceResponse({
        bytes: encoded.bytes,
        operation: 'create-organization',
        expectedMessageId: 'unknown',
        limits: GOVERNANCE_LIMITS,
      }),
    ).toMatchObject({ kind: 'response', response: { outcome: 'unknown', body: {} } })
    expect(
      readGovernanceResponse({
        bytes: encoded.bytes,
        operation: 'create-organization',
        expectedMessageId: 'other',
        limits: GOVERNANCE_LIMITS,
      }),
    ).toEqual({ kind: 'unmatched' })
  })

  it('reserves stage-not-provided for the four named operations', () => {
    const read = readGovernanceRequest({
      bytes: bytes(
        '{"protocolVersion":"governance-public/1","messageId":"s","operation":"create-session","body":{}}',
      ),
      limits: GOVERNANCE_LIMITS,
    })
    expect(read.kind).toBe('protocol-rejected')
  })
})
