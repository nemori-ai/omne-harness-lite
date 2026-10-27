import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import {
  MODEL_SEND,
  decodeCredentialId,
  sameCredentialHolder,
} from '@omne-harness/model-contract/provider'
import type { CredentialId } from '@omne-harness/model-contract'

function identity(accountText: string, organizationText: string) {
  const account = accountCodec.parse(accountText)
  const organization = organizationCodec.parse(organizationText)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}

const tenantA = identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345')
const tenantB = identity('acc_abcdefghjkmnpqrstvwxyz2346', 'org_abcdefghjkmnpqrstvwxyz2346')

function credential(text: string): CredentialId {
  const decoded = decodeCredentialId(text)
  if (!('ok' in decoded)) throw new Error(`fixture credential id ${text}`)
  return decoded.ok
}

describe('decodeCredentialId', () => {
  it('accepts a printable name and returns the same text', () => {
    expect(decodeCredentialId('cred-a')).toEqual({ ok: 'cred-a' })
  })

  it('accepts non-ASCII letters, a paired surrogate and a name of exactly 256 code units', () => {
    expect(decodeCredentialId('密钥-é')).toEqual({ ok: '密钥-é' })
    expect(decodeCredentialId('a\u{20BB7}')).toEqual({ ok: 'a\u{20BB7}' })
    const longest = 'a'.repeat(256)
    expect(decodeCredentialId(longest)).toEqual({ ok: longest })
  })

  it.each([undefined, null, 1, {}, ['a']])('rejects %j as type', value => {
    expect(decodeCredentialId(value)).toEqual({
      failure: { field: 'ModelCredentialId', reason: 'type' },
    })
  })

  it('rejects the empty text as empty', () => {
    expect(decodeCredentialId('')).toEqual({
      failure: { field: 'ModelCredentialId', reason: 'empty' },
    })
  })

  it('counts UTF-16 code units for the length limit', () => {
    expect(decodeCredentialId('a'.repeat(257))).toEqual({
      failure: { field: 'ModelCredentialId', reason: 'length' },
    })
    // 129 astral characters are 258 code units but only 129 code points.
    expect(decodeCredentialId('\u{20BB7}'.repeat(129))).toEqual({
      failure: { field: 'ModelCredentialId', reason: 'length' },
    })
  })

  it.each([
    ['space', 'a b'],
    ['tab', 'a\tb'],
    ['newline', 'a\nb'],
    ['no-break space', 'a b'],
    ['ideographic space', 'a　b'],
    ['NUL control', 'a\u0000b'],
    ['zero-width space', 'a​b'],
    ['right-to-left override', 'a‮b'],
    ['left-to-right isolate', 'a⁦b'],
    ['byte order mark', '﻿a'],
    ['lone high surrogate', 'a\uD800b'],
    ['lone low surrogate', 'a\uDC00'],
    ['reversed surrogate pair', 'a\uDC00\uD800'],
  ])('rejects %s as character', (_name, text) => {
    expect(decodeCredentialId(text)).toEqual({
      failure: { field: 'ModelCredentialId', reason: 'character' },
    })
  })

  it('reports the first failing check: length before character', () => {
    expect(decodeCredentialId(`${'a'.repeat(256)} `)).toEqual({
      failure: { field: 'ModelCredentialId', reason: 'length' },
    })
  })
})

describe('sameCredentialHolder', () => {
  it('is true for the same id and an equal tenant', () => {
    const left = { id: credential('cred-a'), tenant: tenantA }
    const right = {
      id: credential('cred-a'),
      tenant: identity('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345'),
    }
    expect(sameCredentialHolder(left, right)).toBe(true)
  })

  it('is false for another id or another tenant', () => {
    const base = { id: credential('cred-a'), tenant: tenantA }
    expect(sameCredentialHolder(base, { id: credential('cred-b'), tenant: tenantA })).toBe(false)
    expect(sameCredentialHolder(base, { id: credential('cred-a'), tenant: tenantB })).toBe(false)
  })

  it('compares ids exactly, without case folding', () => {
    expect(
      sameCredentialHolder(
        { id: credential('Cred'), tenant: tenantA },
        { id: credential('cred'), tenant: tenantA },
      ),
    ).toBe(false)
  })

  it('is false when a tenant value was not minted by legal-identity', () => {
    const copied = structuredClone(tenantA)
    const holder = { id: credential('cred-a'), tenant: tenantA }
    expect(sameCredentialHolder(holder, { id: credential('cred-a'), tenant: copied })).toBe(false)
    expect(sameCredentialHolder({ id: credential('cred-a'), tenant: copied }, holder)).toBe(false)
  })
})

describe('MODEL_SEND', () => {
  it('is the only purpose of this delivery', () => {
    expect(MODEL_SEND).toBe('model-send')
  })
})
