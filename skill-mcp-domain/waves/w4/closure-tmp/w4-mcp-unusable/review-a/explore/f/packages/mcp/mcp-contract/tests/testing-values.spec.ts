// The sample builders of `./testing`: each one answers a branded value for a lawful sample and
// throws `TypeError` for anything its guard refuses, so a bad sample is a defect of the suite.
import { describe, expect, it } from 'vitest'
import {
  isAdoptionRevision,
  isConnectionTarget,
  isCorrelationKey,
  isCredentialBinding,
  isEndpointHolding,
  isEndpointName,
  isMillis,
  isProtocolVersion,
} from '@omne-harness/mcp-contract'
import {
  adoptionRevisionOf,
  connectionTargetOf,
  correlationKeyOf,
  credentialBindingOf,
  endpointRefOf,
  jsonOf,
  millisOf,
  peerIdentityOf,
} from '@omne-harness/mcp-contract/testing'

describe('the sample builders of the brands', () => {
  it('endpointRefOf builds a reference from the name, with a holding under the name by default', () => {
    const ref = endpointRefOf('files')
    expect(ref).toEqual({ name: 'files', holding: 'tenant/files' })
    expect(isEndpointName(ref.name)).toBe(true)
    expect(isEndpointHolding(ref.holding)).toBe(true)
    expect(endpointRefOf('files', 'ws/files')).toEqual({ name: 'files', holding: 'ws/files' })
    expect(() => endpointRefOf('')).toThrow(TypeError)
    expect(() => endpointRefOf('files', '')).toThrow(TypeError)
  })

  it.each([
    ['adoptionRevisionOf', adoptionRevisionOf, isAdoptionRevision, 'rev-1', ''],
    ['credentialBindingOf', credentialBindingOf, isCredentialBinding, 'main', ''],
    ['correlationKeyOf', correlationKeyOf, isCorrelationKey, 'c1', ''],
    [
      'connectionTargetOf',
      connectionTargetOf,
      isConnectionTarget,
      'https://files.example.test/mcp',
      'ftp://files.example.test/',
    ],
  ] as const)(
    '%s answers the guarded text and refuses what the guard refuses',
    (_name, build, guard, lawful, refused) => {
      const built: unknown = build(lawful)
      expect(built).toBe(lawful)
      expect(guard(built)).toBe(true)
      expect(() => build(refused)).toThrow(TypeError)
    },
  )

  it('millisOf answers a positive safe integer of milliseconds and refuses the rest', () => {
    const built: unknown = millisOf(30_000)
    expect(built).toBe(30_000)
    expect(isMillis(built)).toBe(true)
    expect(() => millisOf(0)).toThrow(TypeError)
    expect(() => millisOf(1.5)).toThrow(TypeError)
  })

  it('peerIdentityOf answers the negotiated facts of a modern peer with the tools capability', () => {
    const peer = peerIdentityOf()
    expect(peer).toEqual({ protocolVersion: '2026-07-28', capabilities: jsonOf({ tools: {} }) })
    expect(isProtocolVersion(peer.protocolVersion)).toBe(true)
    expect(peerIdentityOf('2025-06-18').protocolVersion).toBe('2025-06-18')
    expect(() => peerIdentityOf('')).toThrow(TypeError)
  })
})
