import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  checkSourceToken,
  sourceTokenEquals,
  type SourceToken,
} from '@omne-harness-lite/session-log'

function input() {
  return {
    tenant: { organization: 'organization-a', account: 'account-a' },
    session: 'session-a',
    journalGeneration: 'journal-a',
    tail: 0,
  }
}

function token(value: unknown): SourceToken {
  const checked = checkSourceToken(value)
  if ('failure' in checked) throw new Error('test coordinate was rejected')
  return checked.ok
}

describe('public SourceToken boundary', () => {
  it('copies scope before a caller can mutate it and freezes the result', () => {
    const original = input()
    const owned = token(original)
    original.tenant.account = 'account-b'
    original.session = 'session-b'
    original.journalGeneration = 'journal-b'
    original.tail = 1
    expect(owned).toEqual(input())
    expect(owned.tenant).not.toBe(original.tenant)
    expect(Object.isFrozen(owned)).toBe(true)
    expect(Object.isFrozen(owned.tenant)).toBe(true)
  })

  it.each(['tenant', 'session', 'journalGeneration', 'tail'] as const)(
    'rejects a missing %s field',
    field => {
      const value: Record<string, unknown> = input()
      delete value[field]
      expect(checkSourceToken(value)).toEqual({ failure: 'invalidInput' })
    },
  )

  it.each([
    { ...input(), projectionRuleVersion: 'projection-a' },
    { ...input(), ownerGeneration: 'physical-owner-a' },
    { ...input(), tenant: { ...input().tenant, role: 'admin' } },
    { ...input(), tenant: { organization: 'organization-a' } },
    { ...input(), session: '' },
    { ...input(), session: ' session-a' },
    { ...input(), journalGeneration: '' },
    { ...input(), journalGeneration: 'journal-a\n' },
    { ...input(), tail: -1 },
    { ...input(), tail: 0.5 },
    { ...input(), tail: '1' },
    { ...input(), tail: 1n },
    { ...input(), tail: Number.POSITIVE_INFINITY },
    { ...input(), tail: Number.NaN },
    { ...input(), tail: new LosslessNumber('1e-1') },
    { ...input(), tail: new LosslessNumber('-1e9') },
    null,
    [],
  ])('rejects invalid representation %#', value => {
    expect(checkSourceToken(value)).toEqual({ failure: 'invalidInput' })
  })

  it('does not invoke accessors, including nested tenant accessors', () => {
    let reads = 0
    const accessor = {
      enumerable: true,
      get() {
        reads++
        throw new Error('input code must not run')
      },
    }
    const outer = Object.defineProperty(input(), 'tail', accessor)
    const tenant = Object.defineProperty(input().tenant, 'account', accessor)
    expect(checkSourceToken(outer)).toEqual({ failure: 'invalidInput' })
    expect(checkSourceToken({ ...input(), tenant })).toEqual({ failure: 'invalidInput' })
    expect(reads).toBe(0)
  })

  it('rejects a numeric subclass that overrides the trusted decimal read boundary', () => {
    let reads = 0
    class UntrustedNumber extends LosslessNumber {
      override get source(): string {
        reads++
        throw new Error('input code must not run')
      }
    }
    expect(checkSourceToken({ ...input(), tail: new UntrustedNumber('1') })).toEqual({
      failure: 'invalidInput',
    })
    expect(reads).toBe(0)
  })

  it('rejects a number in the tenant position before reading identity components', () => {
    let reads = 0
    class InvalidTenant extends LosslessNumber {
      get organization(): string {
        reads++
        throw new Error('input code must not run')
      }
    }
    expect(checkSourceToken({ ...input(), tenant: new InvalidTenant('1') })).toEqual({
      failure: 'invalidInput',
    })
    expect(reads).toBe(0)
  })

  it('does not invoke toJSON or accept prototype and hidden members', () => {
    let serialized = false
    const custom = {
      ...input(),
      toJSON() {
        serialized = true
        return input()
      },
    }
    const inherited: unknown = Object.assign(Object.create(input()), input())
    const hidden = Object.defineProperty(input(), 'extra', { value: true })
    const symbol = { ...input(), [Symbol('extra')]: true }
    for (const value of [custom, inherited, hidden, symbol]) {
      expect(checkSourceToken(value)).toEqual({ failure: 'invalidInput' })
    }
    expect(serialized).toBe(false)
  })

  it('preserves adjacent integers beyond Number precision through the JSON boundary', () => {
    const prefix = JSON.stringify(input()).replace('"tail":0', '"tail":9007199254740992')
    const adjacent = prefix.replace('9007199254740992', '9007199254740993')
    const leftRead = readJsonStrict(prefix)
    const rightRead = readJsonStrict(adjacent)
    if ('failed' in leftRead || 'failed' in rightRead) throw new Error('invalid test JSON')
    const left = token(leftRead.ok)
    const right = token(rightRead.ok)
    expect(sourceTokenEquals(left, right)).toBe(false)
    expect(writeJsonLossless(right)).toBe(adjacent)
  })

  it('compares integer value rather than numeric spelling', () => {
    const base = token({ ...input(), tail: 1000 })
    for (const spelling of ['1000.0', '1e3', '100000e-2']) {
      expect(
        sourceTokenEquals(base, token({ ...input(), tail: new LosslessNumber(spelling) })),
      ).toBe(true)
    }
    expect(sourceTokenEquals(token(input()), token({ ...input(), tail: -0 }))).toBe(true)
  })

  it.each([
    { ...input(), tenant: { ...input().tenant, organization: 'organization-b' } },
    { ...input(), tenant: { ...input().tenant, account: 'account-b' } },
    { ...input(), session: 'session-b' },
    { ...input(), journalGeneration: 'journal-b' },
    { ...input(), tail: 1 },
  ])('never shares a source across a changed coordinate %#', value => {
    const base = token(input())
    const changed = token(value)
    expect(sourceTokenEquals(base, changed)).toBe(false)
    expect(sourceTokenEquals(changed, base)).toBe(false)
  })

  it('keeps opaque identity spelling rather than normalizing it', () => {
    const base = token({ ...input(), session: '\u00e9' })
    const decomposed = token({ ...input(), session: 'e\u0301' })
    expect(sourceTokenEquals(base, decomposed)).toBe(false)
  })
})
