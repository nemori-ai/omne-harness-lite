import { describe, expect, it } from 'vitest'
import {
  noArguments,
  canonicalText,
  decisionEvidence,
  digestOf,
  effectiveArgumentsOf,
} from '@omne-harness/authorization'

describe('canonicalText', () => {
  it('does not depend on member order, at any depth', () => {
    expect(canonicalText({ b: 1, a: { d: true, c: 'x' } })).toBe(
      canonicalText({ a: { c: 'x', d: true }, b: 1 }),
    )
    expect(canonicalText({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('drops undefined members and keeps null', () => {
    expect(canonicalText({ a: undefined, b: null })).toBe('{"b":null}')
    expect(canonicalText({ a: 1, b: undefined })).toBe(canonicalText({ a: 1 }))
  })

  it('keeps arrays in order', () => {
    expect(canonicalText([2, 1])).toBe('[2,1]')
    expect(canonicalText([2, 1])).not.toBe(canonicalText([1, 2]))
    expect(canonicalText({ a: [{ y: 1, x: 2 }, 3] })).toBe('{"a":[{"x":2,"y":1},3]}')
  })

  it('orders member names by code unit', () => {
    expect(canonicalText({ b: 0, B: 0, a: 0 })).toBe('{"B":0,"a":0,"b":0}')
  })
})

describe('digestOf and the evidence', () => {
  it('is the SHA-256 hex of the canonical text', () => {
    expect(digestOf({ b: 1, a: 2 })).toMatch(/^[0-9a-f]{64}$/)
    expect(digestOf({ b: 1, a: 2 })).toBe(digestOf({ a: 2, b: 1 }))
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: 2 }))
  })

  it('builds frozen decision evidence owned by authorization', () => {
    const evidence = decisionEvidence('admission/x/y', '3', { k: 'v' })
    expect(evidence).toEqual({
      owner: 'authorization',
      record: 'admission/x/y',
      revision: '3',
      digest: digestOf({ k: 'v' }),
    })
    expect(Object.isFrozen(evidence)).toBe(true)
  })

  it('digests effective arguments the same way, and noArguments() is the digest of null', () => {
    expect(effectiveArgumentsOf({ command: 'ls' })).toEqual({ digest: digestOf({ command: 'ls' }) })
    expect(noArguments()).toEqual({ digest: digestOf(null) })
    expect(Object.isFrozen(noArguments())).toBe(true)
  })
})
