import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { describe, expect, it, vi } from 'vitest'
import {
  STREAM_CALL_MAX_LENGTH,
  STREAM_CURSOR_MAX_LENGTH,
  STREAM_ID_MAX_LENGTH,
  STREAM_POSITION_MAX_LENGTH,
  STREAM_REFERENCE_MAX_LENGTH,
  compareStreamPositions,
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamCursor,
  encodeStreamRef,
  judgeStreamCursor,
  judgeStreamRef,
  parseStreamEnvelope,
  readStreamCursor,
  readStreamRef,
  type StreamCallCodec,
  type StreamCallFailure,
  type StreamCursor,
  type StreamCursorParts,
  type StreamEnvelope,
  type StreamRef,
} from '@omne-harness/stream-arrival'

function success<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome) throw new Error('Expected success')
  return outcome.ok
}

function mintedTenant(text: string): TenantId {
  const result = tenantCodec.parse(text)
  if (!result.ok) throw new Error('Invalid tenant fixture')
  return result.value
}

const tenantText =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}'
const tenant = mintedTenant(tenantText)
const otherTenant = mintedTenant(
  tenantText.replace('acc_00000000000000000000000000', 'acc_00000000000000000000000001'),
)
const call = JSON.stringify(['model-invocation', 1, tenantText, 'mcall_a', 'mop_a'])
const refText = JSON.stringify(['stream-ref', 1, 'model', call, 'str_a'])
const c0 = JSON.stringify(['stream-cursor', 1, refText, '0'])
const c10 = JSON.stringify(['stream-cursor', 1, refText, '10'])
const stream = success(decodeStreamId('str_a'))
const zero = success(decodeStreamPosition('0'))
const ten = success(decodeStreamPosition('10'))

// This is a protocol stub, not a Model identity adapter. Tenant minting is real.
function codecStub() {
  const resolve = vi.fn(
    ({
      text,
      tenant: target,
    }: {
      text: unknown
      tenant: TenantId
    }): Outcome<string, StreamCallFailure> => {
      const encoded = tenantCodec.encode(target)
      if (!encoded.ok) return { failure: { kind: 'invalid-tenant' } }
      if (encoded.value !== tenantText) return { failure: { kind: 'foreign-tenant' } }
      if (text !== call && text !== 'alias') return { failure: { kind: 'malformed' } }
      return { ok: call }
    },
  )
  return { producer: 'model', resolve } satisfies StreamCallCodec
}

function reference(): StreamRef {
  return success(judgeStreamRef({ value: refText, tenant }, codecStub()))
}

function refTuple(producer: unknown = 'model', invocation: unknown = call, id: unknown = 'str_a') {
  return JSON.stringify(['stream-ref', 1, producer, invocation, id])
}

function cursorTuple(ref: unknown = refText, position: unknown = '0') {
  return JSON.stringify(['stream-cursor', 1, ref, position])
}

const invalidRef = (reason: string) => ({
  failure: { kind: 'invalid-envelope', rejection: { field: 'StreamRef', reason } },
})
const invalidCursor = (reason: string) => ({
  failure: { kind: 'invalid', rejection: { field: 'StreamCursor', reason } },
})

function encodeUnknownRef(value: unknown, codec: StreamCallCodec = codecStub()) {
  return encodeStreamRef(value as StreamEnvelope & { tenant: TenantId }, codec)
}

function encodeUnknownCursor(value: unknown) {
  return encodeStreamCursor(value as StreamCursorParts)
}

function envelope() {
  return { tenant, producer: 'model', call, stream } satisfies StreamEnvelope & { tenant: TenantId }
}

describe('stream identity and position text', () => {
  it('keeps the adopted limits', () => {
    expect([
      STREAM_ID_MAX_LENGTH,
      STREAM_POSITION_MAX_LENGTH,
      STREAM_CALL_MAX_LENGTH,
      STREAM_REFERENCE_MAX_LENGTH,
      STREAM_CURSOR_MAX_LENGTH,
    ]).toEqual([256, 256, 1668, 4096, 8192])
  })

  it.each([undefined, null, 1, {}, [], new String('str_a')])(
    'rejects nonstring scalar %j without conversion',
    value => {
      expect(decodeStreamId(value)).toEqual({ failure: { field: 'StreamId', reason: 'type' } })
      expect(decodeStreamPosition(value)).toEqual({
        failure: { field: 'StreamPosition', reason: 'type' },
      })
    },
  )

  it.each(['', 'x'.repeat(257)])('checks scalar length before syntax', value => {
    expect(decodeStreamId(value)).toEqual({ failure: { field: 'StreamId', reason: 'length' } })
    expect(decodeStreamPosition(value)).toEqual({
      failure: { field: 'StreamPosition', reason: 'length' },
    })
  })

  it.each([
    'str_',
    'str_a\n',
    'str_a\r',
    'str_a ',
    ' str_a',
    'STR_a',
    'str_é',
    'str_😀',
    'str_a.b',
  ])('rejects the complete invalid identity %j', value => {
    expect(decodeStreamId(value)).toEqual({ failure: { field: 'StreamId', reason: 'identity' } })
  })

  it.each(['00', '01', '+1', '-1', '1.0', '1e3', ' 1', '1 ', '1\n', '１', 'a'.repeat(256)])(
    'rejects noncanonical position %j',
    value => {
      expect(decodeStreamPosition(value)).toEqual({
        failure: { field: 'StreamPosition', reason: 'position' },
      })
    },
  )

  it('admits complete boundary values and all allowed identity characters', () => {
    for (const value of ['str_AaZz09_-', 'str_' + 'a'.repeat(252)])
      expect(decodeStreamId(value)).toEqual({ ok: value })
    for (const value of ['0', '1', '9'.repeat(256)])
      expect(decodeStreamPosition(value)).toEqual({ ok: value })
  })

  it.each([
    ['0', '0', 0],
    ['9', '10', -1],
    ['10', '9', 1],
    ['10', '11', -1],
    ['11', '10', 1],
    ['9007199254740992', '9007199254740993', -1],
    ['9'.repeat(255), '1' + '0'.repeat(255), -1],
  ] as const)('compares %s and %s without number conversion', (left, right, order) => {
    expect(
      compareStreamPositions(
        success(decodeStreamPosition(left)),
        success(decodeStreamPosition(right)),
      ),
    ).toBe(order)
  })
})

describe('reference parsing and failure precedence', () => {
  it.each([
    [undefined, 'type'],
    [null, 'type'],
    [{}, 'type'],
    ['', 'length'],
    [' '.repeat(4097), 'length'],
    [' '.repeat(4096), 'syntax'],
    ['\ufeff' + refText, 'syntax'],
    ['{', 'syntax'],
    ['null', 'shape'],
    ['{}', 'shape'],
    ['[]', 'domain'],
    ['["other"]', 'domain'],
    ['["stream-ref"]', 'version'],
    ['["stream-ref","1",null,null,null,null]', 'version'],
    ['["stream-ref",2]', 'version'],
    ['["stream-ref",1]', 'shape'],
    [JSON.stringify(['stream-ref', 1, 'bad', null, null, null]), 'shape'],
    [refTuple('bad', null, null), 'producer'],
    [refTuple('model', 1, null), 'shape'],
    [refTuple('model', '', null), 'length'],
    [refTuple('model', 'a'.repeat(1669), null), 'length'],
    [refTuple('model', call, null), 'identity'],
    [refTuple('model', call, ''), 'identity'],
    [refTuple('model', call, 'str_'), 'identity'],
    [refTuple('model', call, 'str_' + 'a'.repeat(253)), 'identity'],
  ])('rejects malformed envelope %# with %s', (value, reason) => {
    const parsed = parseStreamEnvelope(value)
    expect(parsed).toEqual({ failure: { field: 'StreamRef', reason } })
    const codec = codecStub()
    expect(judgeStreamRef({ value, tenant }, codec)).toEqual(invalidRef(String(reason)))
    expect(codec.resolve).not.toHaveBeenCalled()
  })

  it('accepts a call at its limit and counts UTF-16 code units', () => {
    expect(success(parseStreamEnvelope(refTuple('tool', '😀'.repeat(834)))).call).toHaveLength(1668)
    expect(parseStreamEnvelope(refTuple('tool', '😀'.repeat(834) + 'a'))).toEqual({
      failure: { field: 'StreamRef', reason: 'length' },
    })
  })

  it('allows outer whitespace exactly up to the reference budget', () => {
    const value = refText.padEnd(STREAM_REFERENCE_MAX_LENGTH)
    expect(judgeStreamRef({ value, tenant }, codecStub())).toEqual({ ok: refText })
    expect(judgeStreamRef({ value: value + ' ', tenant }, codecStub())).toEqual(
      invalidRef('length'),
    )
  })

  it('rejects an unminted tenant before even invalid text or wrong producer', () => {
    const codec = codecStub()
    for (const value of [undefined, refTuple('tool')])
      expect(judgeStreamRef({ value, tenant: { ...tenant } }, codec)).toEqual({
        failure: { kind: 'invalid-tenant' },
      })
    expect(codec.resolve).not.toHaveBeenCalled()
  })

  it('rejects a mismatched producer before resolving its call', () => {
    const codec = codecStub()
    expect(judgeStreamRef({ value: refTuple('tool', 'not a call'), tenant }, codec)).toEqual({
      failure: { kind: 'wrong-producer' },
    })
    expect(codec.resolve).not.toHaveBeenCalled()
  })

  it('preserves foreign tenant and malformed call failures from the injected codec', () => {
    expect(judgeStreamRef({ value: refText, tenant: otherTenant }, codecStub())).toEqual({
      failure: { kind: 'foreign-tenant' },
    })
    expect(
      judgeStreamRef({ value: refTuple('model', 'tool invocation stub'), tenant }, codecStub()),
    ).toEqual({ failure: { kind: 'malformed' } })
  })

  it.each(['malformed', 'invalid-tenant', 'foreign-tenant'] as const)(
    'preserves the codec failure %s',
    kind => {
      const failure = { kind }
      const codec: StreamCallCodec = { producer: 'model', resolve: () => ({ failure }) }
      expect(judgeStreamRef({ value: refText, tenant }, codec)).toEqual({ failure })
      expect(encodeStreamRef(envelope(), codec)).toEqual({ failure })
    },
  )

  it('propagates codec exceptions as implementation errors', () => {
    const fault = new Error('codec fault')
    const codec: StreamCallCodec = {
      producer: 'model',
      resolve: () => {
        throw fault
      },
    }
    expect(() => judgeStreamRef({ value: refText, tenant }, codec)).toThrow(fault)
    expect(() => encodeStreamRef(envelope(), codec)).toThrow(fault)
  })

  it.each([undefined, null, 12, {}, '', 'x'.repeat(1669)])(
    'throws for an invalid codec success %#',
    value => {
      const codec: StreamCallCodec = { producer: 'model', resolve: () => ({ ok: value as string }) }
      expect(() => judgeStreamRef({ value: refText, tenant }, codec)).toThrow(TypeError)
      expect(() => encodeStreamRef(envelope(), codec)).toThrow(TypeError)
    },
  )

  it('checks canonical reference output length after the codec succeeds', () => {
    const codec: StreamCallCodec = {
      producer: 'model',
      resolve: () => ({ ok: '\u0000'.repeat(1668) }),
    }
    expect(judgeStreamRef({ value: refText, tenant }, codec)).toEqual(invalidRef('length'))
    expect(encodeStreamRef(envelope(), codec)).toEqual(invalidRef('length'))
  })

  it('admits exactly the canonical output limit and rejects one more code unit', () => {
    const overhead = refTuple('model', '').length
    const controls = '\u0000'.repeat(670)
    const boundary = controls + 'a'.repeat(4096 - overhead - controls.length * 6)
    const codec: StreamCallCodec = { producer: 'model', resolve: () => ({ ok: boundary }) }
    const ref = success(encodeStreamRef(envelope(), codec))
    expect(ref).toHaveLength(4096)
    expect(readStreamRef(ref).call).toBe(boundary)
    expect(judgeStreamRef({ value: ref, tenant }, codec)).toEqual({ ok: ref })
    const oversized: StreamCallCodec = {
      producer: 'model',
      resolve: () => ({ ok: boundary + 'a' }),
    }
    expect(encodeStreamRef(envelope(), oversized)).toEqual(invalidRef('length'))
  })
})

describe('canonical values and frozen reads', () => {
  it.each(['model', 'tool'] as const)(
    'round-trips %s text without Unicode or case normalization',
    producer => {
      const canonicalCall = 'Ä e\u0301 É \\ " \u0000 \ud800 😀'
      const codec: StreamCallCodec = { producer, resolve: () => ({ ok: canonicalCall }) }
      const ref = success(encodeStreamRef({ ...envelope(), producer }, codec))
      expect(ref).toBe(JSON.stringify(['stream-ref', 1, producer, canonicalCall, stream]))
      expect(readStreamRef(ref).call).toBe(canonicalCall)
      const cursor = success(encodeStreamCursor({ ref, position: ten }))
      expect(readStreamCursor(cursor)).toEqual({ ref, position: ten })
      expect(judgeStreamCursor({ value: cursor, ref })).toEqual({ ok: cursor })
    },
  )

  it('matches the fixed generation expressions through both constructors', () => {
    const codec = codecStub()
    const ref = success(encodeStreamRef(envelope(), codec))
    expect(ref).toBe(refText)
    expect(encodeStreamCursor({ ref, position: zero })).toEqual({ ok: c0 })
    expect(encodeStreamCursor({ ref, position: ten })).toEqual({ ok: c10 })
    expect(readStreamRef(ref)).toEqual({ producer: 'model', call, stream: 'str_a' })
    expect(readStreamCursor(success(judgeStreamCursor({ value: c10, ref })))).toEqual({
      ref,
      position: '10',
    })
  })

  it('normalizes outer whitespace, equivalent JSON escapes and the original codec result', () => {
    expect(
      judgeStreamRef(
        { value: ' ' + refText.replace('str_a', '\\u0073tr_a') + ' ', tenant },
        codecStub(),
      ),
    ).toEqual({ ok: refText })
    expect(judgeStreamRef({ value: refTuple('model', 'alias'), tenant }, codecStub())).toEqual({
      ok: refText,
    })
    expect(encodeStreamRef({ ...envelope(), call: 'alias' }, codecStub())).toEqual({ ok: refText })
    expect(
      judgeStreamCursor({
        value: ' ' + c10.replace('stream-cursor', '\\u0073tream-cursor') + ' ',
        ref: reference(),
      }),
    ).toEqual({ ok: c10 })
  })

  it('freezes only returned records and does not re-run the producer codec on read', () => {
    const codec = codecStub()
    const input = envelope()
    const ref = success(encodeStreamRef(input, codec))
    const parts = { ref, position: ten }
    const cursor = success(encodeStreamCursor(parts))
    const parsed = success(parseStreamEnvelope(ref))
    const read = readStreamRef(ref)
    const cursorRead = readStreamCursor(cursor)
    expect([parsed, read, cursorRead].every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(parts)).toBe(false)
    input.call = 'changed'
    parts.position = zero
    expect(read.call).toBe(call)
    expect(cursorRead.position).toBe('10')
    expect(codec.resolve).toHaveBeenCalledTimes(1)
    expect(() => Object.assign(read, { call: 'mutated' })).toThrow(TypeError)
    expect(() => Object.assign(cursorRead, { position: zero })).toThrow(TypeError)
  })

  it.each(['private input', ' ' + refText, refTuple('bad')])(
    'rejects unreadable forged reference brands without exposing text',
    value => {
      expect(() => readStreamRef(value as StreamRef)).toThrow(new TypeError('Invalid StreamRef'))
      expect(() => encodeStreamCursor({ ref: value as StreamRef, position: zero })).toThrow(
        TypeError,
      )
    },
  )

  it.each(['private input', ' ' + c0, cursorTuple(refText, '01')])(
    'rejects unreadable forged cursor brands without exposing text',
    value => {
      expect(() => readStreamCursor(value as StreamCursor)).toThrow(
        new TypeError('Invalid StreamCursor'),
      )
    },
  )

  it('also rejects a forged cursor whose embedded reference is not canonical', () => {
    expect(() => readStreamCursor(cursorTuple(' ' + refText) as StreamCursor)).toThrow(TypeError)
  })
})

describe('cursor scope and structure', () => {
  it.each([
    [undefined, 'type'],
    [{}, 'type'],
    ['', 'length'],
    [' '.repeat(8193), 'length'],
    [' '.repeat(8192), 'syntax'],
    ['{', 'syntax'],
    ['null', 'shape'],
    ['{}', 'shape'],
    ['[]', 'domain'],
    ['["other"]', 'domain'],
    ['["stream-cursor"]', 'version'],
    ['["stream-cursor","1",null,null,null]', 'version'],
    ['["stream-cursor",1]', 'shape'],
    [JSON.stringify(['stream-cursor', 1, null, null, null]), 'shape'],
    [cursorTuple(1, '01'), 'shape'],
    [cursorTuple('', '01'), 'length'],
    [cursorTuple('x'.repeat(4097), '01'), 'length'],
    [cursorTuple('other', 0), 'position'],
    [cursorTuple('other', ''), 'position'],
    [cursorTuple('other', '01'), 'position'],
    [cursorTuple('other', '9'.repeat(257)), 'position'],
  ])('checks cursor structure before stream matching %#', (value, reason) => {
    expect(judgeStreamCursor({ value, ref: reference() })).toEqual(invalidCursor(String(reason)))
  })

  it.each([refTuple('model', call, 'str_b'), ' ' + refText, 'x'.repeat(4096)])(
    'rejects different embedded reference text %#',
    embedded => {
      expect(judgeStreamCursor({ value: cursorTuple(embedded), ref: reference() })).toEqual({
        failure: { kind: 'foreign-stream' },
      })
    },
  )

  it('admits maximum position and raw cursor budgets without truncation', () => {
    const ref = reference()
    const position = success(decodeStreamPosition('9'.repeat(256)))
    const cursor = success(encodeStreamCursor({ ref, position }))
    expect(readStreamCursor(cursor).position).toBe(position)
    expect(judgeStreamCursor({ value: cursor.padEnd(8192), ref })).toEqual({ ok: cursor })
    expect(judgeStreamCursor({ value: cursor.padEnd(8193), ref })).toEqual(invalidCursor('length'))
  })

  it.each([0, '', '01', '9'.repeat(257), '1\n'])(
    'revalidates forged position text %# in cursor construction',
    position => {
      expect(encodeUnknownCursor({ ref: reference(), position })).toEqual(invalidCursor('position'))
    },
  )
})

describe('exact constructor data records', () => {
  it('accepts null prototypes and readonly data properties', () => {
    const input = Object.assign(Object.create(null), envelope()) as ReturnType<typeof envelope>
    expect(encodeStreamRef(Object.freeze(input), codecStub())).toEqual({ ok: refText })
    const parts = Object.assign(Object.create(null), {
      ref: reference(),
      position: zero,
    }) as StreamCursorParts
    expect(encodeStreamCursor(Object.freeze(parts))).toEqual({ ok: c0 })
  })

  it.each([null, undefined, 'text', 0, [], new Date(), () => 1])(
    'rejects nonrecord constructor input %#',
    value => {
      expect(encodeUnknownRef(value)).toEqual(invalidRef('shape'))
      expect(encodeUnknownCursor(value)).toEqual(invalidCursor('shape'))
    },
  )

  it('rejects unknown, symbol, absent, nonenumerable and inherited fields', () => {
    const valid = envelope()
    const invalid = [
      { ...valid, extra: 1 },
      { ...valid, [Symbol('extra')]: 1 },
      { producer: 'model', call, stream },
      Object.defineProperty({ ...valid }, 'tenant', { enumerable: false }),
      Object.assign(Object.create({ tenant }), { producer: 'model', call, stream }),
    ]
    for (const value of invalid) expect(encodeUnknownRef(value)).toEqual(invalidRef('shape'))
    const ref = reference()
    for (const value of [
      { ref, position: zero, extra: 1 },
      { ref, position: zero, [Symbol('extra')]: 1 },
      { ref },
      Object.defineProperty({ ref, position: zero }, 'ref', { enumerable: false }),
      Object.assign(Object.create({ ref }), { position: zero }),
    ])
      expect(encodeUnknownCursor(value)).toEqual(invalidCursor('shape'))
  })

  it('never invokes getters, toJSON or conversion functions', () => {
    const sideEffect = vi.fn(() => {
      throw new Error('must not run')
    })
    const refGetter = Object.defineProperty(envelope(), 'call', {
      get: sideEffect,
      enumerable: true,
    })
    const cursorGetter = Object.defineProperty({ ref: reference(), position: zero }, 'position', {
      get: sideEffect,
      enumerable: true,
    })
    expect(encodeUnknownRef(refGetter)).toEqual(invalidRef('shape'))
    expect(encodeUnknownCursor(cursorGetter)).toEqual(invalidCursor('shape'))
    expect(encodeUnknownRef({ ...envelope(), toJSON: sideEffect })).toEqual(invalidRef('shape'))
    expect(encodeUnknownCursor({ ref: reference(), position: zero, toJSON: sideEffect })).toEqual(
      invalidCursor('shape'),
    )
    const unknownText = {
      get value() {
        return sideEffect()
      },
      toJSON: sideEffect,
      toString: sideEffect,
      [Symbol.toPrimitive]: sideEffect,
    }
    expect(parseStreamEnvelope(unknownText)).toEqual({
      failure: { field: 'StreamRef', reason: 'type' },
    })
    expect(judgeStreamCursor({ value: unknownText, ref: reference() })).toEqual(
      invalidCursor('type'),
    )
    expect(decodeStreamId(unknownText)).toEqual({ failure: { field: 'StreamId', reason: 'type' } })
    expect(decodeStreamPosition(unknownText)).toEqual({
      failure: { field: 'StreamPosition', reason: 'type' },
    })
    expect(encodeUnknownRef({ ...envelope(), call: unknownText })).toEqual(invalidRef('shape'))
    expect(sideEffect).not.toHaveBeenCalled()
  })

  it.each(['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'] as const)(
    'reports %s reflection failure as unreadable',
    trap => {
      const handler = {
        [trap]: () => {
          throw new Error('private reflection error')
        },
      }
      expect(encodeUnknownRef(new Proxy(envelope(), handler))).toEqual(invalidRef('unreadable'))
      expect(encodeUnknownCursor(new Proxy({ ref: reference(), position: zero }, handler))).toEqual(
        invalidCursor('unreadable'),
      )
    },
  )

  it('reports revoked proxy reflection failure as unreadable', () => {
    const ref = Proxy.revocable(envelope(), {})
    const cursor = Proxy.revocable({ ref: reference(), position: zero }, {})
    ref.revoke()
    cursor.revoke()
    expect(encodeUnknownRef(ref.proxy)).toEqual(invalidRef('unreadable'))
    expect(encodeUnknownCursor(cursor.proxy)).toEqual(invalidCursor('unreadable'))
  })

  it('checks record capture, tenant, fields, producer and codec in order', () => {
    const codec = codecStub()
    expect(encodeUnknownRef({ ...envelope(), tenant: { ...tenant }, extra: 1 }, codec)).toEqual(
      invalidRef('shape'),
    )
    expect(
      encodeUnknownRef({ ...envelope(), tenant: { ...tenant }, producer: 'bad' }, codec),
    ).toEqual({ failure: { kind: 'invalid-tenant' } })
    expect(
      encodeUnknownRef({ ...envelope(), producer: 'bad', call: '', stream: '' }, codec),
    ).toEqual(invalidRef('producer'))
    expect(
      encodeUnknownRef({ ...envelope(), producer: 'tool', call: '', stream: '' }, codec),
    ).toEqual(invalidRef('length'))
    expect(encodeUnknownRef({ ...envelope(), producer: 'tool', stream: '' }, codec)).toEqual(
      invalidRef('identity'),
    )
    expect(encodeUnknownRef({ ...envelope(), producer: 'tool' }, codec)).toEqual({
      failure: { kind: 'wrong-producer' },
    })
    expect(codec.resolve).not.toHaveBeenCalled()
  })

  it('uses captured values without invoking proxy property reads', () => {
    const get = vi.fn(() => {
      throw new Error('unexpected property read')
    })
    const input = new Proxy(envelope(), { get })
    expect(encodeStreamRef(input, codecStub())).toEqual({ ok: refText })
    const parts = new Proxy({ ref: reference(), position: zero }, { get })
    expect(encodeStreamCursor(parts)).toEqual({ ok: c0 })
    expect(get).not.toHaveBeenCalled()
  })
})
