// The boundary parse of a secret text (SPEC「秘密设置项」): what may become a `SecretText`, and what is
// refused before any custody sees it. Every refused input here would otherwise reach a vault file.
import { describe, expect, it } from 'vitest'
import { SECRET_TEXT_MAX_LENGTH, parseSecretText } from '../src/secrets.ts'

describe('parseSecretText', () => {
  it.each([
    ['nothing', ''],
    ['only whitespace', ' \t\r\n '],
  ])('refuses %s as empty', (_name, raw) => {
    expect(parseSecretText(raw)).toEqual({ ok: false, reason: 'empty' })
  })

  it.each(['abc\ndef', 'abc\u001b[Adef', 'abc\u0000', 'abc\u007fdef', `${'k'.repeat(8)}\u0007`])(
    'refuses %j for its control character',
    raw => {
      expect(parseSecretText(raw)).toEqual({ ok: false, reason: 'control-character' })
    },
  )

  it('refuses an input longer than the limit, measured after the whitespace is removed', () => {
    const limit = 'k'.repeat(SECRET_TEXT_MAX_LENGTH)
    expect(parseSecretText(`  ${limit}  `)).toEqual({ ok: true, value: limit })
    expect(parseSecretText(`${limit}k`)).toEqual({ ok: false, reason: 'too-long' })
  })

  it('keeps a legal input without the whitespace around it, and nothing else changes', () => {
    const key = 'sk-or-v1-SYNTHETIC-abcdef0123456789'
    expect(parseSecretText(`  \t${key}\r\n`)).toEqual({ ok: true, value: key })
    expect(parseSecretText(key)).toEqual({ ok: true, value: key })
  })

  it('keeps inner spaces and non-ASCII text: only the ends are trimmed', () => {
    expect(parseSecretText(' pass phrase 密钥 ')).toEqual({ ok: true, value: 'pass phrase 密钥' })
  })
})
