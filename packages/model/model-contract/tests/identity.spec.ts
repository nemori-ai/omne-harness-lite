import type { Outcome } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  MODEL_IDENTITY_MAX_LENGTH,
  MODEL_IDENTITY_PREFIXES,
  compareOutputCursors,
  compareRevisions,
  decodeDispatchId,
  decodeModelCallId,
  decodeModelDiagnosticCursor,
  decodeModelDiagnosticId,
  decodeModelInstanceId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeReadId,
  decodeResultVersion,
  decodeRevision,
  deriveGuardControlOperation,
} from '../src/index.ts'

describe('identity constants', () => {
  it('limits every identity text to 256 UTF-16 code units', () => {
    expect(MODEL_IDENTITY_MAX_LENGTH).toBe(256)
  })

  it('gives each prefixed identity its own prefix', () => {
    expect(MODEL_IDENTITY_PREFIXES).toEqual({
      ModelCallId: 'mcall_',
      ModelDispatchId: 'mdisp_',
      ModelInstanceId: 'minst_',
      ModelOperationId: 'mop_',
      ModelResultVersion: 'mrver_',
      ModelReadId: 'mread_',
      ModelDiagnosticId: 'mdiag_',
      ModelDiagnosticCursor: 'mdcur_',
    })
    expect(new Set(Object.values(MODEL_IDENTITY_PREFIXES)).size).toBe(8)
  })

  it('keeps the prefix table frozen, so no caller can make one decoder accept another identity', () => {
    expect(Object.isFrozen(MODEL_IDENTITY_PREFIXES)).toBe(true)
  })
})

const prefixed = [
  ['ModelCallId', decodeModelCallId],
  ['ModelDispatchId', decodeDispatchId],
  ['ModelInstanceId', decodeModelInstanceId],
  ['ModelOperationId', decodeModelOperationId],
  ['ModelReadId', decodeReadId],
  ['ModelResultVersion', decodeResultVersion],
  ['ModelDiagnosticId', decodeModelDiagnosticId],
  ['ModelDiagnosticCursor', decodeModelDiagnosticCursor],
] as const

describe.each(prefixed)('decoder of %s', (key, decode) => {
  const prefix = MODEL_IDENTITY_PREFIXES[key]
  const rejected = (reason: string) => ({ failure: { field: key, reason } })

  it('accepts the prefix and a body of letters, digits, underscore and hyphen', () => {
    for (const text of [
      `${prefix}a`,
      `${prefix}01HZX3-aB_9`,
      `${prefix}123e4567-e89b-12d3-a456-426614174000`,
    ])
      expect(decode(text)).toEqual({ ok: text })
  })

  it('accepts a text of exactly 256 code units and rejects 257 as length', () => {
    const longest = prefix + 'a'.repeat(MODEL_IDENTITY_MAX_LENGTH - prefix.length)
    expect(decode(longest)).toEqual({ ok: longest })
    expect(decode(`${longest}a`)).toEqual(rejected('length'))
  })

  it.each([undefined, null, 1, true, {}, ['x'], Symbol.for('x')])('rejects %s as type', value => {
    expect(decode(value)).toEqual(rejected('type'))
  })

  it('rejects the empty text as empty, not as prefix', () => {
    expect(decode('')).toEqual(rejected('empty'))
  })

  it('rejects a text without the prefix as prefix', () => {
    expect(decode('abc')).toEqual(rejected('prefix'))
    expect(decode(prefix.toUpperCase() + 'a')).toEqual(rejected('prefix'))
    expect(decode(` ${prefix}a`)).toEqual(rejected('prefix'))
  })

  it('rejects the prefix alone as prefix, not as character', () => {
    expect(decode(prefix)).toEqual(rejected('prefix'))
  })

  it('rejects the prefix of another identity', () => {
    for (const [other, otherPrefix] of Object.entries(MODEL_IDENTITY_PREFIXES))
      if (other !== key && !otherPrefix.startsWith(prefix) && !prefix.startsWith(otherPrefix))
        expect(decode(`${otherPrefix}a`)).toEqual(rejected('prefix'))
  })

  it.each([
    ['space', 'a b'],
    ['trailing newline', 'ab\n'],
    ['dot', 'a.b'],
    ['colon', 'a:b'],
    ['non-ASCII letter', 'aé'],
    ['astral character', 'a\u{20BB7}'],
    ['lone surrogate', 'a\uD800'],
    ['zero-width space', 'a​'],
  ])('rejects a body with %s as character', (_name, body) => {
    expect(decode(prefix + body)).toEqual(rejected('character'))
  })

  it('reports the first failing check: length before prefix, prefix before character', () => {
    expect(decode(`x ${'a'.repeat(MODEL_IDENTITY_MAX_LENGTH)}`)).toEqual(rejected('length'))
    expect(decode('x y')).toEqual(rejected('prefix'))
    expect(decode(`${'x'.repeat(prefix.length)} y`)).toEqual(rejected('prefix'))
  })
})

describe('decodeModelOperationId', () => {
  it('still accepts a body that starts with the reserved double hyphen', () => {
    expect(decodeModelOperationId('mop_--x')).toEqual({ ok: 'mop_--x' })
  })
})

const sequences = [
  ['ModelRevision', decodeRevision],
  ['ModelOutputCursor', decodeOutputCursor],
] as const

describe.each(sequences)('decoder of %s', (key, decode) => {
  const rejected = (reason: string) => ({ failure: { field: key, reason } })

  it('accepts zero and digit strings without a leading zero', () => {
    for (const text of ['0', '1', '9', '10', '9007199254740993', '1'.padEnd(256, '0')])
      expect(decode(text)).toEqual({ ok: text })
  })

  it('accepts 256 digits and rejects 257 as length', () => {
    expect(decode('7'.repeat(256))).toEqual({ ok: '7'.repeat(256) })
    expect(decode('7'.repeat(257))).toEqual(rejected('length'))
  })

  it.each([undefined, null, 1, 10n, {}, ['1']])('rejects %s as type', value => {
    expect(decode(value)).toEqual(rejected('type'))
  })

  it('rejects the empty text as empty', () => {
    expect(decode('')).toEqual(rejected('empty'))
  })

  it.each([
    ['sign', '-1'],
    ['plus sign', '+1'],
    ['decimal point', '1.5'],
    ['exponent', '1e3'],
    ['hexadecimal', '0x10'],
    ['space', '1 '],
    ['non-ASCII digit', '١٢'],
    ['prefixed text', 'mcall_1'],
  ])('rejects %s as character', (_name, text) => {
    expect(decode(text)).toEqual(rejected('character'))
  })

  it.each(['00', '01', '007', '0'.repeat(256)])('rejects %s as leading-zero', text => {
    expect(decode(text)).toEqual(rejected('leading-zero'))
  })

  it('reports the first failing check: length before character, character before leading-zero', () => {
    expect(decode(`0${'x'.repeat(256)}`)).toEqual(rejected('length'))
    expect(decode('0x')).toEqual(rejected('character'))
  })
})

function comparisonCases<B extends string>(
  name: string,
  compare: (left: B, right: B) => -1 | 0 | 1,
  decode: (text: unknown) => Outcome<B, unknown>,
) {
  describe(name, () => {
    function value(text: string): B {
      const decoded = decode(text)
      if (!('ok' in decoded)) throw new Error(`fixture sequence ${text}`)
      return decoded.ok
    }
    const order = (left: string, right: string) => compare(value(left), value(right))

    it('is 0 for the same value', () => {
      expect(order('0', '0')).toBe(0)
      expect(order('42', '42')).toBe(0)
    })

    it('orders by integer value, so "10" is after "9"', () => {
      expect(order('9', '10')).toBe(-1)
      expect(order('10', '9')).toBe(1)
    })

    it('orders a longer number after a shorter one and equal lengths by digit', () => {
      expect(order('99', '100')).toBe(-1)
      expect(order('0', '1')).toBe(-1)
      expect(order('123', '129')).toBe(-1)
      expect(order('129', '123')).toBe(1)
      expect(order('2000', '1999')).toBe(1)
    })

    it('stays exact beyond the largest safe integer', () => {
      expect(order('9007199254740992', '9007199254740993')).toBe(-1)
      expect(order('9007199254740993', '9007199254740992')).toBe(1)
      const long = '9'.repeat(256)
      expect(order(long, `${'9'.repeat(255)}8`)).toBe(1)
      expect(order(long, long)).toBe(0)
    })
  })
}

comparisonCases('compareRevisions', compareRevisions, decodeRevision)
comparisonCases('compareOutputCursors', compareOutputCursors, decodeOutputCursor)

describe('deriveGuardControlOperation', () => {
  function call(text: string) {
    const decoded = decodeModelCallId(text)
    if (!('ok' in decoded)) throw new Error(`fixture call ${text}`)
    return decoded.ok
  }

  it('is "mop_--" followed by the body of the call', () => {
    expect(deriveGuardControlOperation(call('mcall_01HZX3-aB_9'))).toBe('mop_--01HZX3-aB_9')
    expect(deriveGuardControlOperation(call('mcall_--x'))).toBe('mop_----x')
  })

  it('keeps the length of the call, also at the longest call', () => {
    const longest = call('mcall_' + 'a'.repeat(MODEL_IDENTITY_MAX_LENGTH - 6))
    expect(deriveGuardControlOperation(longest)).toHaveLength(MODEL_IDENTITY_MAX_LENGTH)
    expect(deriveGuardControlOperation(call('mcall_a'))).toHaveLength('mcall_a'.length)
  })

  it('is accepted by decodeModelOperationId, also at the longest call', () => {
    for (const text of ['mcall_a', 'mcall_-', 'mcall_--', `mcall_${'a-'.repeat(125)}`]) {
      const derived = deriveGuardControlOperation(call(text))
      expect(decodeModelOperationId(derived)).toEqual({ ok: derived })
    }
  })

  it('gives the same value for the same call and different values for different calls', () => {
    const texts = ['mcall_a', 'mcall_b', 'mcall_-a', 'mcall_--a', 'mcall_a-', 'mcall_A', 'mcall_aa']
    const derived = texts.map(text => deriveGuardControlOperation(call(text)))
    expect(new Set(derived).size).toBe(texts.length)
    expect(deriveGuardControlOperation(call('mcall_a'))).toBe(derived[0])
  })
})
