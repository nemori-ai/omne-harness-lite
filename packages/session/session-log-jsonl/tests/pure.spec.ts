import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  toOpaqueJson,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import { checkAppendInput, type AppendRequest } from '@omne-harness-lite/session-log'
import {
  decodeLogBytes,
  emptyLogState,
  encodeCommitLine,
  foldCommit,
  judgeAppend,
  type LogCommit,
  type LogState,
} from '../src/index.ts'

const tenant = { organization: 'organization', account: 'account' }
const otherTenant = { organization: 'other', account: 'account' }
const entry = {
  tenant,
  payload: { text: 'one' },
  readKeys: ['read'],
  dedupeKey: 'key',
  run: 'run',
  attempt: 2,
}
const unfenced = { kind: 'unfenced' }
const unconditional = { kind: 'unconditional' }
function request(
  entries: unknown = [entry],
  fence: unknown = unfenced,
  condition: unknown = unconditional,
): AppendRequest {
  const checked = checkAppendInput('session', entries, fence, condition)
  if ('failure' in checked) throw new Error('fixture is invalid')
  return checked.ok
}
function commit(req: AppendRequest, first = 1): LogCommit {
  return { v: 1, session: req.session, first, entries: req.entries }
}
const populated = (): LogState => foldCommit(emptyLogState(), commit(request()))

describe('SL3 pure representation and owned values', () => {
  it.each([
    ['missing condition', [entry], unfenced, undefined],
    ['unknown condition', [entry], unfenced, { kind: 'automatic' }],
    ['extra unconditional member', [entry], unfenced, { kind: 'unconditional', tail: 0 }],
    [
      'extra tail condition member',
      [entry],
      unfenced,
      { kind: 'tailEquals', tail: 0, extra: true },
    ],
    ['missing tail', [entry], unfenced, { kind: 'tailEquals' }],
    ['negative tail', [entry], unfenced, { kind: 'tailEquals', tail: -1 }],
    [
      'fractional tail',
      [entry],
      unfenced,
      { kind: 'tailEquals', tail: new LosslessNumber('0.0000000000000000001') },
    ],
    ['missing fence', [entry], undefined, unconditional],
    ['unknown fence', [entry], { kind: 'automatic' }, unconditional],
    ['extra fence member', [entry], { kind: 'unfenced', run: 'run' }, unconditional],
    ['empty entries', [], unfenced, unconditional],
    ['missing tenant', [{ payload: null, readKeys: [] }], unfenced, unconditional],
    ['missing payload', [{ tenant, readKeys: [] }], unfenced, unconditional],
    ['missing read keys', [{ tenant, payload: null }], unfenced, unconditional],
    ['position supplied', [{ ...entry, position: 1 }], unfenced, unconditional],
    ['extra shell member', [{ ...entry, clock: 'now' }], unfenced, unconditional],
    [
      'run without attempt',
      [{ tenant, run: 'run', payload: null, readKeys: [] }],
      unfenced,
      unconditional,
    ],
    [
      'attempt without run',
      [{ tenant, attempt: 1, payload: null, readKeys: [] }],
      unfenced,
      unconditional,
    ],
    ['zero attempt', [{ ...entry, attempt: 0 }], unfenced, unconditional],
    ['fraction attempt', [{ ...entry, attempt: 1.5 }], unfenced, unconditional],
    ['invalid read key', [{ ...entry, readKeys: [' key'] }], unfenced, unconditional],
    ['duplicate read keys', [{ ...entry, readKeys: ['read', 'read'] }], unfenced, unconditional],
    ['invalid dedupe key', [{ ...entry, dedupeKey: '' }], unfenced, unconditional],
    ['duplicate batch keys', [entry, entry], unfenced, unconditional],
    [
      'mixed batch tenants',
      [entry, { ...entry, tenant: otherTenant, dedupeKey: 'other' }],
      unfenced,
      unconditional,
    ],
    ['mismatched fenced run', [entry], { kind: 'fenced', run: 'other', attempt: 2 }, unconditional],
    [
      'mismatched fenced attempt',
      [entry],
      { kind: 'fenced', run: 'run', attempt: 1 },
      unconditional,
    ],
    ['unsupported class', [{ ...entry, payload: new Date(0) }], unfenced, unconditional],
    [
      'undefined nested value',
      [{ ...entry, payload: { member: undefined } }],
      unfenced,
      unconditional,
    ],
    [
      'nonfinite number',
      [{ ...entry, payload: Number.POSITIVE_INFINITY }],
      unfenced,
      unconditional,
    ],
    ['function payload', [{ ...entry, payload: () => 1 }], unfenced, unconditional],
  ])('rejects %s before state interpretation', (_name, entries, fence, condition) => {
    expect(checkAppendInput('session', entries, fence, condition)).toEqual({
      failure: 'invalidInput',
    })
  })
  it('rejects absent and lexically invalid session without defaulting', () => {
    for (const session of [undefined, '', ' session', 'session\n'])
      expect(checkAppendInput(session, [entry], unfenced, unconditional)).toEqual({
        failure: 'invalidInput',
      })
  })
  it('rejects cycles, getters and sparse arrays without invoking user code', () => {
    const cycle: Record<string, unknown> = {}
    cycle.member = cycle
    let invoked = false
    const getters = {
      get member() {
        invoked = true
        return 1
      },
    }
    const sparse = new Array(1)
    for (const payload of [cycle, getters, sparse])
      expect(checkAppendInput('session', [{ ...entry, payload }], unfenced, unconditional)).toEqual(
        { failure: 'invalidInput' },
      )
    expect(invoked).toBe(false)
  })
  it('owns and freezes queued values, including core opaque exchange data', () => {
    const payload = { nested: [1, 2] }
    const input = [{ ...entry, payload, readKeys: ['original'] }]
    const owned = request(input)
    payload.nested.push(3)
    input[0]?.readKeys.push('later')
    expect(owned.entries[0]?.payload).toEqual({ nested: [1, 2] })
    expect(owned.entries[0]?.readKeys).toEqual(['original'])
    expect(Object.isFrozen(owned.entries[0]?.payload)).toBe(true)
    const opaque = request([
      { ...entry, payload: toOpaqueJson({ exact: new LosslessNumber('9007199254740993') }) },
    ])
    expect(writeJsonLossless(opaque.entries[0]?.payload)).toBe('{"exact":9007199254740993}')
  })
  it.each([
    ['keyless unconditional', [{ tenant, payload: null, readKeys: [] }], unfenced, unconditional],
    [
      'keyless tail zero',
      [{ tenant, payload: null, readKeys: [] }],
      unfenced,
      { kind: 'tailEquals', tail: 0 },
    ],
    ['unfenced old attempt', [entry], unfenced, unconditional],
    ['fenced unconditional', [entry], { kind: 'fenced', run: 'run', attempt: 2 }, unconditional],
    [
      'fenced tail zero',
      [entry],
      { kind: 'fenced', run: 'run', attempt: 2 },
      { kind: 'tailEquals', tail: 0 },
    ],
  ])('permits %s without inventing business requirements', (_name, entries, fence, condition) => {
    expect(judgeAppend(emptyLogState(), request(entries, fence, condition))).toEqual({
      positions: [1],
      tail: 1,
    })
  })
})

describe('SL3 four authoritative decisions', () => {
  it('orders tenant, fence, dedupe and tail without mutating confirmed state', () => {
    const state = populated()
    const wrongTail = { kind: 'tailEquals', tail: 99 }
    expect(
      judgeAppend(
        state,
        request(
          [{ ...entry, tenant: otherTenant, attempt: 1 }],
          { kind: 'fenced', run: 'run', attempt: 1 },
          wrongTail,
        ),
      ),
    ).toEqual({ failure: 'tenantMismatch' })
    expect(
      judgeAppend(
        state,
        request([{ ...entry, attempt: 1 }], { kind: 'fenced', run: 'run', attempt: 1 }, wrongTail),
      ),
    ).toEqual({ failure: 'attemptSuperseded' })
    expect(judgeAppend(state, request([entry], unfenced, wrongTail))).toEqual({
      failure: 'alreadyRecorded',
      keys: ['key'],
    })
    expect(
      judgeAppend(state, request([{ ...entry, dedupeKey: 'fresh' }], unfenced, wrongTail)),
    ).toEqual({ failure: 'tailChanged', tail: 1 })
    expect(state.tail).toBe(1)
    expect(state.dedupeKeys).toEqual(['key'])
    expect(state.maxAttempts).toEqual([['run', 2]])
  })
  it('future tail is a legal conflict and does not initialize an empty state', () => {
    const state = emptyLogState()
    expect(
      judgeAppend(
        state,
        request([entry], unfenced, {
          kind: 'tailEquals',
          tail: new LosslessNumber('9007199254740993'),
        }),
      ),
    ).toEqual({ failure: 'tailChanged', tail: 0 })
    expect(state.tenant).toBeUndefined()
    expect(judgeAppend(state, request([{ ...entry, tenant: otherTenant }]))).toEqual({
      positions: [1],
      tail: 1,
    })
  })
  it('compares adjacent unsafe integers exactly rather than using Number', () => {
    const state = { ...emptyLogState(), tail: new LosslessNumber('9007199254740993') }
    const match = judgeAppend(
      state,
      request([entry], unfenced, {
        kind: 'tailEquals',
        tail: new LosslessNumber('9007199254740993'),
      }),
    )
    const mismatch = judgeAppend(
      state,
      request([entry], unfenced, {
        kind: 'tailEquals',
        tail: new LosslessNumber('9007199254740992'),
      }),
    )
    expect(writeJsonLossless(match)).toBe(
      '{"positions":[9007199254740994],"tail":9007199254740994}',
    )
    expect(writeJsonLossless(mismatch)).toBe('{"failure":"tailChanged","tail":9007199254740993}')
  })
  it('fences exact attempts but permits unfenced settlement and shell-only folding', () => {
    const attempt = new LosslessNumber('9007199254740993')
    const state = foldCommit(
      emptyLogState(),
      commit(request([{ ...entry, attempt, payload: { kind: 'end', arbitrary: true } }])),
    )
    const old = { ...entry, dedupeKey: 'second', attempt: new LosslessNumber('9007199254740992') }
    expect(
      judgeAppend(state, request([old], { kind: 'fenced', run: 'run', attempt: old.attempt })),
    ).toEqual({ failure: 'attemptSuperseded' })
    expect(judgeAppend(state, request([old]))).toEqual({ positions: [2], tail: 2 })
    expect(state.readPositions).toEqual([['read', 1]])
  })
  it('batch collision rejects every entry and does not equate stored payloads', () => {
    const requestBatch = request([
      { tenant, payload: { kind: 'assistant' }, readKeys: [] },
      { ...entry, payload: { totally: 'different' } },
    ])
    expect(judgeAppend(populated(), requestBatch)).toEqual({
      failure: 'alreadyRecorded',
      keys: ['key'],
    })
  })
  it('folding invariants throw instead of mapping defects to unavailable', () => {
    expect(() => foldCommit(emptyLogState(), commit(request(), 2))).toThrow('contiguous')
    expect(() =>
      foldCommit(populated(), commit(request([{ ...entry, tenant: otherTenant }]), 2)),
    ).toThrow('tenants')
  })
})

describe('strict lossless commit bytes', () => {
  it('round trips unsafe integers, decimals, arrays and business-invalid JSON unchanged', () => {
    const read = readJsonStrict(
      '{"large":9007199254740993,"decimal":0.12345678901234567890123456789,"array":[false,null,{"kind":"invalid_business"}],"__proto__":{"safe":true}}',
    )
    if ('failed' in read) throw new Error('JSON fixture invalid')
    const original = commit(request([{ ...entry, payload: read.ok }]))
    const bytes = encodeCommitLine(original)
    const decoded = decodeLogBytes(bytes, original.session)
    if ('failure' in decoded) throw new Error('unexpected corrupt result')
    expect(writeJsonLossless(decoded.commits[0]?.commit.entries[0]?.payload)).toBe(
      writeJsonLossless(read.ok),
    )
    expect(decoded.validBytes).toBe(bytes.length)
    expect(decoded.needsTruncation).toBe(false)
    expect(new TextDecoder().decode(bytes)).not.toContain('condition')
    expect(new TextDecoder().decode(bytes)).not.toContain('position')
  })
  it('returns truncation for a half final line without exposing any half batch', () => {
    const original = commit(request())
    const first = encodeCommitLine(original)
    const second = encodeCommitLine(commit(request([{ ...entry, dedupeKey: 'second' }]), 2))
    const bytes = new Uint8Array([...first, ...second.subarray(0, second.length - 6)])
    const decoded = decodeLogBytes(bytes, original.session)
    if ('failure' in decoded) throw new Error('unexpected corrupt result')
    expect(decoded.commits).toHaveLength(1)
    expect(decoded.validBytes).toBe(first.length)
    expect(decoded.needsTruncation).toBe(true)
  })
  it('duplicate members and malformed UTF8 at the final suffix require repair', () => {
    const session = request().session
    for (const bytes of [new TextEncoder().encode('{"v":1,"v":1}\n'), new Uint8Array([255, 10])]) {
      expect(decodeLogBytes(bytes, session)).toEqual({
        commits: [],
        validBytes: 0,
        needsTruncation: true,
      })
    }
  })
  it('does not repair a damaged middle row or skip it to read a later batch', () => {
    const row = encodeCommitLine(commit(request()))
    const bytes = new Uint8Array([...new TextEncoder().encode('bad\n'), ...row])
    expect(decodeLogBytes(bytes, request().session)).toEqual({
      failure: 'corrupt',
      line: 1,
      reason: 'representation',
    })
  })
  it('session mismatch and noncontiguous final row remain corrupt, not tail repair', () => {
    const row = encodeCommitLine(commit(request()))
    const other = checkAppendInput('other-session', [entry], unfenced, unconditional)
    if ('failure' in other) throw new Error('fixture invalid')
    expect(decodeLogBytes(row, other.ok.session)).toEqual({
      failure: 'corrupt',
      line: 1,
      reason: 'session',
    })
    expect(decodeLogBytes(encodeCommitLine(commit(request(), 2)), request().session)).toEqual({
      failure: 'corrupt',
      line: 1,
      reason: 'position',
    })
  })
})
