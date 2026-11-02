import { describe, expect, it } from 'vitest'
import type { Outcome } from '@omne-harness/operation-result'
import { judgePart } from '@omne-harness/message'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeStreamId, encodeStreamRef } from '@omne-harness/stream-arrival'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeRevision,
} from '../src/identity-values.ts'
import { encodeModelInvocationRef, resolveModelInvocationRef } from '../src/reference.ts'
import type { ModelStreamSnapshot } from '../src/model-stream-values.ts'
import {
  decodeModelOutputV1,
  encodeModelOutputV1,
  type ModelOutputV1Snapshot,
} from '../src/model-output-v1.ts'

function must<T, F>(result: Outcome<T, F>): T {
  if ('failure' in result) throw new Error('Expected successful codec result')
  return result.ok
}
function snapshot(): ModelOutputV1Snapshot {
  return {
    projection: 'model-output-v1',
    phase: 'running',
    cursor: must(decodeOutputCursor('900719925474099312345')),
    revision: must(decodeRevision('900719925474099312346')),
    blocks: [],
  }
}
function internalSnapshot(): ModelStreamSnapshot {
  const tenant = tenantCodec.parse(
    JSON.stringify({ organization: 'org_' + '0'.repeat(26), account: 'acc_' + '0'.repeat(26) }),
  )
  if (!tenant.ok) throw new Error('Invalid tenant fixture')
  const call = must(decodeModelCallId('mcall_a'))
  const dispatch = must(decodeDispatchId('mdisp_a'))
  const reference = must(
    encodeModelInvocationRef({
      tenant: tenant.value,
      call,
      admission: must(decodeModelOperationId('mop_a')),
    }),
  )
  const ref = must(
    encodeStreamRef(
      {
        tenant: tenant.value,
        producer: 'model',
        call: reference,
        stream: must(decodeStreamId('str_a')),
      },
      {
        producer: 'model',
        resolve({ text, tenant: target }) {
          const resolved = resolveModelInvocationRef(text, target)
          if ('failure' in resolved) return { failure: { kind: resolved.failure.kind } }
          return { ok: must(encodeModelInvocationRef(resolved.ok)) }
        },
      },
    ),
  )
  return {
    ref,
    dispatch,
    value: {
      call,
      cursor: snapshot().cursor,
      blocks: [],
      state: {
        call,
        revision: snapshot().revision,
        consumer: { owner: 'agent', work: 'w', position: 'p', purpose: 'reply' },
        control: { kind: 'none' },
        custody: { kind: 'producer' },
        phase: 'running',
        dispatch,
        firstContent: 'none-proven',
      },
    },
  }
}
const visibility = { toHuman: true, toModel: true }
const identity = { id: 'b1', visibility }
const ref = { storage: 's', key: 'k', mediaType: 'm', bytes: '3', digest: 'd' }
const parts: readonly Record<string, unknown>[] = [
  { ...identity, kind: 'text', text: 'answer' },
  { ...identity, kind: 'thinking', text: 'thought' },
  { ...identity, kind: 'voice', mediaType: 'audio/raw', inline: 'abc' },
  { ...identity, kind: 'image', mediaType: 'image/raw', inline: 'abc' },
  { ...identity, kind: 'file', storage: 's', key: 'k', mediaType: 'file/raw' },
  ...['voice', 'image', 'file'].map(kind => ({ ...identity, kind, ref, transcript: null })),
  {
    ...identity,
    kind: 'tool_call',
    callId: 'tc',
    name: 'tool',
    arguments: {
      kind: 'object',
      entries: [{ key: 'number', value: { kind: 'number', lexeme: '900719925474099312345.0' } }],
    },
  },
  {
    ...identity,
    visibility: { toHuman: false, toModel: true },
    kind: 'reasoning_state',
    payload: 'opaque',
    pairs: ['b2', 'b3'],
  },
]

describe('model-output-v1 JSON projection', () => {
  it('projects confirmed snapshots and uses explicit baseline phase for internal state-only deltas', () => {
    const input = internalSnapshot()
    expect(must(decodeModelOutputV1(must(encodeModelOutputV1(input))))).toStrictEqual(snapshot())
    const delta = {
      ref: input.ref,
      dispatch: input.dispatch,
      from: { outputCursor: input.value.cursor, revision: input.value.state.revision },
      outputCursor: input.value.cursor,
      state: { ...input.value.state, revision: must(decodeRevision('900719925474099312347')) },
      blocks: [],
    }
    const unchanged = JSON.parse(must(encodeModelOutputV1(delta, 'running')))
    expect(unchanged).toStrictEqual({
      projection: 'model-output-v1',
      base: { cursor: input.value.cursor, revision: input.value.state.revision },
      cursor: input.value.cursor,
      revision: delta.state.revision,
      blocks: [],
    })
    expect(JSON.parse(must(encodeModelOutputV1(delta, 'retry-decision')))).toStrictEqual({
      ...unchanged,
      phase: 'running',
    })
    expect(Reflect.apply(encodeModelOutputV1, undefined, [delta])).toHaveProperty('failure')
  })

  it('omits unknown producer blocks and unlisted fields but refuses unknown wire blocks', () => {
    const known = {
      kind: 'sealed',
      index: '1',
      block: { ...parts[0], secret: 'synthetic-block-secret' },
    }
    const unknown = { kind: 'future', index: '2', secret: 'synthetic-unknown-secret' }
    const input = { ...snapshot(), blocks: [known, unknown] }
    const result: unknown = Reflect.apply(encodeModelOutputV1, undefined, [input])
    if (
      typeof result !== 'object' ||
      result === null ||
      !('ok' in result) ||
      typeof result.ok !== 'string'
    )
      throw new Error('Expected encoded output')
    const encoded = result.ok
    expect(JSON.parse(encoded)).toStrictEqual({
      ...snapshot(),
      blocks: [{ kind: 'sealed', index: '1', block: parts[0] }],
    })
    expect(encoded).not.toContain('secret')
    expect(decodeModelOutputV1(JSON.stringify(input))).toHaveProperty('failure')
  })
  it('preserves large decimal identities and emits only snapshot projection fields', () => {
    const input = { ...snapshot(), secret: 'synthetic-secret', ref: 'private-stream' }
    const encoded = must(encodeModelOutputV1(input))
    expect(JSON.parse(encoded)).toStrictEqual(snapshot())
    expect(encoded).not.toContain('synthetic-secret')
    expect(must(encodeModelOutputV1(must(decodeModelOutputV1(encoded))))).toBe(encoded)
  })

  it('keeps state-only deltas and each successive applied revision as the next base', () => {
    const initial = snapshot()
    const first = {
      projection: 'model-output-v1',
      base: { cursor: initial.cursor, revision: initial.revision },
      cursor: initial.cursor,
      revision: must(decodeRevision('900719925474099312347')),
      blocks: [],
    } as const
    const second = {
      ...first,
      base: { cursor: first.cursor, revision: first.revision },
      revision: must(decodeRevision('900719925474099312348')),
      phase: 'settled',
    } as const
    for (const value of [first, second]) {
      const encoded = must(encodeModelOutputV1(value))
      expect(must(decodeModelOutputV1(encoded))).toStrictEqual(value)
      expect(must(encodeModelOutputV1(must(decodeModelOutputV1(encoded))))).toBe(encoded)
    }
  })

  it.each(parts)('round-trips every sealed block without losing required fields %#', value => {
    const part = judgePart(value)
    if (
      'rejected' in part ||
      part.ok.kind === 'tool_result' ||
      part.ok.kind === 'tool_call_incomplete' ||
      part.ok.kind === 'tool_call_unparsed'
    )
      throw new Error('Invalid Model block fixture')
    const input = {
      ...snapshot(),
      blocks: [{ kind: 'sealed', index: '0', block: part.ok }],
    } as const
    const encoded = must(encodeModelOutputV1(input))
    expect(must(decodeModelOutputV1(encoded))).toStrictEqual(input)
    expect(must(encodeModelOutputV1(must(decodeModelOutputV1(encoded))))).toBe(encoded)
    for (const key of Object.keys(value)) {
      const invalid = { ...value }
      Reflect.deleteProperty(invalid, key)
      expect(
        decodeModelOutputV1(
          JSON.stringify({ ...input, blocks: [{ kind: 'sealed', index: '0', block: invalid }] }),
        ),
      ).toHaveProperty('failure')
    }
  })

  it.each(['text', 'thinking', 'tool-arguments', 'voice'] as const)(
    'round-trips growing %s in both modes',
    content => {
      for (const mode of ['append', 'replace'] as const) {
        const input = {
          ...snapshot(),
          blocks: [{ kind: 'growing', index: '2', content, mode, value: 'cumulative' }],
        } as const
        const encoded = must(encodeModelOutputV1(input))
        expect(must(decodeModelOutputV1(encoded))).toStrictEqual(input)
      }
    },
  )

  it('rejects malformed envelopes, fields, phases, identities, blocks and non-JSON values', () => {
    const valid = snapshot()
    const invalid = [
      null,
      [],
      { ...valid, projection: 'other' },
      { ...valid, phase: 'done' },
      { ...valid, ref: 'private' },
      { ...valid, state: {} },
      { ...valid, base: {} },
      { ...valid, base: { cursor: valid.cursor, revision: valid.revision, ref: 'private' } },
      ...['01', '-1', '1.0', '1e2', '', 1].flatMap(value => [
        { ...valid, cursor: value },
        { ...valid, revision: value },
        { ...valid, base: { cursor: value, revision: valid.revision } },
        { ...valid, base: { cursor: valid.cursor, revision: value } },
      ]),
      {
        ...valid,
        blocks: [{ kind: 'growing', index: '0', mode: 'append', content: 'text', value: 1 }],
      },
      {
        ...valid,
        blocks: [{ kind: 'sealed', index: '0', block: { ...identity, kind: 'unknown' } }],
      },
      {
        ...valid,
        blocks: [
          {
            kind: 'sealed',
            index: '0',
            block: {
              ...identity,
              kind: 'tool_call_incomplete',
              callId: 'c',
              name: 'n',
              partial: '',
            },
          },
        ],
      },
    ]
    for (const value of invalid)
      expect(decodeModelOutputV1(JSON.stringify(value))).toHaveProperty('failure')
    for (const key of Object.keys(valid)) {
      const value = { ...valid }
      Reflect.deleteProperty(value, key)
      expect(decodeModelOutputV1(JSON.stringify(value))).toHaveProperty('failure')
    }
    for (const text of ['{', '{"projection":"model-output-v1","cursor":NaN}', '', 'null'])
      expect(decodeModelOutputV1(text)).toHaveProperty('failure')
    expect(decodeModelOutputV1(1)).toHaveProperty('failure')
    expect(
      Reflect.apply(encodeModelOutputV1, undefined, [
        {
          ...valid,
          blocks: [
            { kind: 'growing', index: '0', content: 'text', mode: 'append', value: Number.NaN },
          ],
        },
      ]),
    ).toHaveProperty('failure')
  })
})
