import { describe, expect, it } from 'vitest'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { checkAppendInput } from '../src/index.ts'

const tenant = { organization: 'org-a', account: 'account-a' }
const unfenced = { kind: 'unfenced' }
const unconditional = { kind: 'unconditional' }
const invalid = { failure: 'invalidInput' }
function entry() {
  return { tenant: { ...tenant }, readKeys: ['read-a'], payload: { opaque: ['original'] } }
}

describe('L1/L2 public append representation and ownership', () => {
  it('owns and freezes the full batch in caller order without inventing keys', () => {
    const first = entry()
    const second = { ...entry(), readKeys: [] }
    const checked = checkAppendInput('session', [first, second], unfenced, unconditional)
    if ('failure' in checked) throw new Error('legal unkeyed batch rejected')
    first.tenant.account = 'replaced'
    first.readKeys.push('later')
    first.payload.opaque[0] = 'changed'
    expect(checked.ok.entries).toEqual([entry(), { ...entry(), readKeys: [] }])
    expect(checked.ok.entries[0]).not.toHaveProperty('dedupeKey')
    expect(Object.isFrozen(checked)).toBe(true)
    expect(Object.isFrozen(checked.ok)).toBe(true)
    expect(Object.isFrozen(checked.ok.entries)).toBe(true)
    expect(Object.isFrozen(checked.ok.entries[0])).toBe(true)
    expect(Object.isFrozen(checked.ok.entries[0]?.tenant)).toBe(true)
    expect(Object.isFrozen(checked.ok.entries[0]?.readKeys)).toBe(true)
    expect(Object.isFrozen(checked.ok.entries[0]?.payload)).toBe(true)
  })

  it('keeps exact large attempts and compares numerically equivalent fence values', () => {
    const attempt = readJsonStrict('100000000000000000001')
    const equivalent = readJsonStrict('100000000000000000001.0')
    if ('failed' in attempt || 'failed' in equivalent) throw new Error('exact fixture rejected')
    const checked = checkAppendInput(
      'session',
      [{ ...entry(), run: 'run', attempt: attempt.ok, dedupeKey: 'key' }],
      { kind: 'fenced', run: 'run', attempt: equivalent.ok },
      { kind: 'tailEquals', tail: 0 },
    )
    expect(checked).toHaveProperty('ok')
    if ('failure' in checked) throw new Error('equivalent fence rejected')
    expect(checked.ok.entries[0]?.attempt).toEqual(attempt.ok)
    expect(checked.ok.entries[0]?.dedupeKey).toBe('key')
    expect(checked.ok.entries[0]?.readKeys).toEqual(['read-a'])
  })

  it.each([
    null,
    [],
    {},
    { ...entry(), tenant: { organization: 'org-a' } },
    { ...entry(), tenant: { ...tenant, role: 'admin' } },
    { ...entry(), readKeys: null },
    { ...entry(), readKeys: ['read-a', 'read-a'] },
    { ...entry(), readKeys: [''] },
    { ...entry(), readKeys: [1] },
    { ...entry(), run: 'run' },
    { ...entry(), attempt: 1 },
    { ...entry(), run: '', attempt: 1 },
    { ...entry(), run: 'run', attempt: 0 },
    { ...entry(), run: 'run', attempt: 1.5 },
    { ...entry(), dedupeKey: '' },
    { ...entry(), dedupeKey: 1 },
    { ...entry(), payload: undefined },
    { ...entry(), payload: Number.NaN },
    { ...entry(), payload: { owner: 'messages', version: 'wrong', kind: 'message', value: {} } },
    { ...entry(), position: 1 },
  ])('rejects illegal entry representation %# before admission', value => {
    expect(checkAppendInput('session', [value], unfenced, unconditional)).toEqual(invalid)
  })

  it('requires a nonempty batch, one tenant and distinct batch dedupe keys', () => {
    expect(checkAppendInput('session', [], unfenced, unconditional)).toEqual(invalid)
    expect(
      checkAppendInput(
        'session',
        [entry(), { ...entry(), tenant: { ...tenant, account: 'other' } }],
        unfenced,
        unconditional,
      ),
    ).toEqual(invalid)
    expect(
      checkAppendInput(
        'session',
        [
          { ...entry(), dedupeKey: 'same' },
          { ...entry(), dedupeKey: 'same' },
        ],
        unfenced,
        unconditional,
      ),
    ).toEqual(invalid)
    expect(
      checkAppendInput(
        'session',
        [
          { ...entry(), dedupeKey: 'one' },
          { ...entry(), dedupeKey: 'two' },
        ],
        unfenced,
        unconditional,
      ),
    ).toHaveProperty('ok')
  })

  it.each([
    entry(),
    { ...entry(), run: 'other', attempt: 1 },
    { ...entry(), run: 'run', attempt: 2 },
  ])('requires every fenced entry to match both run and attempt %#', value => {
    expect(
      checkAppendInput(
        'session',
        [value],
        { kind: 'fenced', run: 'run', attempt: 1 },
        unconditional,
      ),
    ).toEqual(invalid)
  })

  it.each([
    [null, unconditional],
    [{ kind: 'unfenced', extra: true }, unconditional],
    [{ kind: 'fenced', run: 'run', attempt: 0 }, unconditional],
    [unfenced, undefined],
    [unfenced, { kind: 'tailEquals', tail: -1 }],
    [unfenced, { kind: 'unconditional', extra: true }],
  ])('keeps fence and condition closed and required %#', (fence, condition) => {
    expect(checkAppendInput('session', [entry()], fence, condition)).toEqual(invalid)
  })

  it('does not execute caller accessors while copying a batch', () => {
    let reads = 0
    const value = Object.defineProperty(entry(), 'payload', {
      enumerable: true,
      get() {
        reads++
        throw new Error('caller code must not run')
      },
    })
    expect(checkAppendInput('session', [value], unfenced, unconditional)).toEqual(invalid)
    expect(reads).toBe(0)
  })
})
