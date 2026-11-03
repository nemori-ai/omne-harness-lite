import { describe, expect, it } from 'vitest'
import {
  isActionName,
  isAdoptionRevision,
  isCatalogRevision,
  isConnectionTarget,
  isCorrelationKey,
  isCredentialBinding,
  isDefinitionDigest,
  isEndpointHolding,
  isEndpointName,
  isGeneration,
  isMillis,
  isProtocolVersion,
  isRequestState,
  isTaskId,
} from '@omne-harness/mcp-contract'

describe('isConnectionTarget', () => {
  const accepted = [
    'https://mcp.example.test/v1',
    'http://127.0.0.1:8080/',
    'https://[::1]:9000/mcp?tenant=a',
  ]
  const refused = [
    'HTTPS://mcp.example.test/',
    'ftp://mcp.example.test/',
    '/mcp',
    'mcp.example.test/mcp',
    'https://mcp.example.test/#part',
    'https://user:secret@mcp.example.test/',
    'https://user@mcp.example.test/',
    'https://mcp.example.test/a b',
    ' https://mcp.example.test/',
    'https://mcp.example.test/\u0007',
    'http:///mcp',
    'https://',
    '',
  ]

  for (const target of accepted)
    it(`accepts ${target}`, () => {
      expect(isConnectionTarget(target)).toBe(true)
    })

  for (const target of refused)
    it(`refuses ${JSON.stringify(target)} without repairing it`, () => {
      expect(isConnectionTarget(target)).toBe(false)
    })

  it('refuses a value that is not text', () => {
    expect(isConnectionTarget(new URL('https://mcp.example.test/'))).toBe(false)
  })
})

describe('number brands', () => {
  it('takes a time span only as a positive safe integer of milliseconds', () => {
    expect([1, 30_000].map(isMillis)).toEqual([true, true])
    expect([0, -1, 1.5, Number.NaN, Infinity, 2 ** 53, '10'].map(isMillis)).toEqual(
      Array(7).fill(false),
    )
  })

  it('starts a connection generation at zero', () => {
    expect([0, 1, 41].map(isGeneration)).toEqual([true, true, true])
    expect([-1, 0.5, 2 ** 53].map(isGeneration)).toEqual([false, false, false])
  })

  it('starts a catalog revision at one', () => {
    expect([1, 2].map(isCatalogRevision)).toEqual([true, true])
    expect([0, -1, 1.5].map(isCatalogRevision)).toEqual([false, false, false])
  })
})

describe('text brands', () => {
  it('names an endpoint with the lexicon of a capability name', () => {
    expect(['a', 'files-2', 'a'.repeat(64)].map(isEndpointName)).toEqual([true, true, true])
    expect(['', 'A', 'a_b', 'a--b', '-a', 'a'.repeat(65)].map(isEndpointName)).toEqual(
      Array(6).fill(false),
    )
  })

  it('takes a definition digest only as a lower-case SHA-256 text', () => {
    expect(isDefinitionDigest(`sha256:${'0a'.repeat(32)}`)).toBe(true)
    expect(isDefinitionDigest(`sha256:${'0A'.repeat(32)}`)).toBe(false)
    expect(isDefinitionDigest(`sha256:${'0a'.repeat(31)}`)).toBe(false)
    expect(isDefinitionDigest('0a'.repeat(32))).toBe(false)
  })

  const opaque = {
    isActionName,
    isAdoptionRevision,
    isCorrelationKey,
    isCredentialBinding,
    isEndpointHolding,
    isProtocolVersion,
    isRequestState,
    isTaskId,
  }

  for (const [name, guard] of Object.entries(opaque))
    it(`${name} takes any non-empty text as written and nothing else`, () => {
      expect(guard('x')).toBe(true)
      expect(guard(' padded ')).toBe(true)
      expect(guard('')).toBe(false)
      expect(guard(7)).toBe(false)
      expect(guard(undefined)).toBe(false)
    })
})
