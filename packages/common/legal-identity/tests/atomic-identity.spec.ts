import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  accountEquals,
  loginStateCodec,
  loginStateEquals,
  organizationCodec,
  organizationEquals,
  type AccountId,
} from '@omne-harness/legal-identity'

const ACCOUNT_TEXT = 'acc_abcdefghjkmnpqrstvwxyz2345'
const ORGANIZATION_TEXT = 'org_abcdefghjkmnpqrstvwxyz2345'
const LOGIN_STATE_TEXT = 'lgn_abcdefghjkmnpqrstvwxyz2345'

function parsedAccount(text: string): AccountId {
  const result = accountCodec().parse(text)
  if (!result.ok) throw new Error(`fixture ${text} did not parse: ${result.error.code}`)
  return result.value
}

describe('atomic identity codecs', () => {
  it.each([
    ['AccountId', accountCodec, ACCOUNT_TEXT],
    ['OrganizationId', organizationCodec, ORGANIZATION_TEXT],
    ['LoginStateId', loginStateCodec, LOGIN_STATE_TEXT],
  ] as const)('parses %s into frozen plain data and encodes the same text', (name, codec, text) => {
    const parsed = codec().parse(text)
    expect(parsed).toEqual({ ok: true, value: { name, text } })
    if (!parsed.ok) return
    expect(Object.isFrozen(parsed.value)).toBe(true)
    expect(codec().encode(parsed.value as never)).toEqual({ ok: true, value: text })
  })

  it.each([
    ['an account text as an organization', organizationCodec, ACCOUNT_TEXT],
    ['an organization text as an account', accountCodec, ORGANIZATION_TEXT],
    ['an account text as a login state', loginStateCodec, ACCOUNT_TEXT],
    ['the string a as an account', accountCodec, 'a'],
  ] as const)('rejects %s with family', (_case, codec, text) => {
    expect(codec().parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'family' },
    })
  })

  it.each([
    ['empty text', ''],
    ['a 25-character body', 'acc_abcdefghjkmnpqrstvwxyz234'],
    ['a 27-character body', 'acc_abcdefghjkmnpqrstvwxyz23456'],
    ['i in the body', 'acc_ibcdefghjkmnpqrstvwxyz2345'],
    ['l in the body', 'acc_abcdefghjkmnpqrstvwxyz234l'],
    ['o in the body', 'acc_abcdefghjkmnopqrstvwxyz234'],
    ['u in the body', 'acc_abcdefghjkmnpqrstuvwxyz234'],
    ['a hyphen in the body', 'acc_abcdefghjkmnpqrstvwxyz-345'],
  ])('rejects %s with lexicon', (_case, text) => {
    expect(accountCodec().parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'lexicon' },
    })
  })

  it.each([
    ['an uppercase prefix', 'ACC_abcdefghjkmnpqrstvwxyz2345'],
    ['an uppercase body character', 'acc_Abcdefghjkmnpqrstvwxyz2345'],
  ])('rejects %s with case and does not fold it', (_case, text) => {
    expect(accountCodec().parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'case' },
    })
  })

  it.each([
    ['a leading space', ' acc_abcdefghjkmnpqrstvwxyz2345'],
    ['a trailing space', 'acc_abcdefghjkmnpqrstvwxyz2345 '],
    ['a leading tab', '\tacc_abcdefghjkmnpqrstvwxyz2345'],
    ['a trailing newline', 'acc_abcdefghjkmnpqrstvwxyz2345\n'],
  ])('rejects %s with whitespace and does not trim it', (_case, text) => {
    expect(accountCodec().parse(text)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'whitespace' },
    })
  })

  it.each([
    ['AccountId', accountCodec, accountEquals, ACCOUNT_TEXT, 'acc_abcdefghjkmnpqrstvwxyz2346'],
    [
      'OrganizationId',
      organizationCodec,
      organizationEquals,
      ORGANIZATION_TEXT,
      'org_abcdefghjkmnpqrstvwxyz2346',
    ],
    [
      'LoginStateId',
      loginStateCodec,
      loginStateEquals,
      LOGIN_STATE_TEXT,
      'lgn_abcdefghjkmnpqrstvwxyz2346',
    ],
  ] as const)('compares two %s parses by value', (_name, codec, equals, text, otherText) => {
    const first = codec().parse(text)
    const again = codec().parse(text)
    const other = codec().parse(otherText)
    if (!first.ok || !again.ok || !other.ok) throw new Error('fixture did not parse')
    expect(first.value).not.toBe(again.value)
    expect(equals(first.value as never, again.value as never)).toBe(true)
    expect(equals(first.value as never, other.value as never)).toBe(false)
  })
})

describe('the parse-only mint path', () => {
  it('refuses to encode or compare a hand-built account', () => {
    const forged: AccountId = { name: 'AccountId', text: ACCOUNT_TEXT }
    const parsed = parsedAccount(ACCOUNT_TEXT)
    expect(accountCodec().encode(forged)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'type' },
    })
    expect(accountEquals(forged, parsed)).toBe(false)
    expect(accountEquals(parsed, forged)).toBe(false)
    expect(accountEquals(forged, forged)).toBe(false)
  })

  it('refuses to encode or compare a parsed organization as an account', () => {
    const organization = organizationCodec().parse(ORGANIZATION_TEXT)
    if (!organization.ok) throw new Error('fixture did not parse')
    const asAccount = organization.value as unknown as AccountId
    expect(accountCodec().encode(asAccount)).toEqual({
      ok: false,
      error: { kind: 'identity-text-error', code: 'type' },
    })
    expect(accountEquals(asAccount, asAccount)).toBe(false)
  })
})
