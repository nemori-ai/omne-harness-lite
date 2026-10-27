import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeStreamId,
  encodeStreamRef,
  type StreamCallCodec,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import { judgeContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeResultVersion,
  decodeRevision,
  encodeModelInvocationRef,
  resolveModelInvocationRef,
  type CallState,
  type DispatchId,
  type ModelBlock,
  type ModelCallId,
  type OutputCursor,
  type Revision,
  type VisibleBlock,
} from '@omne-harness/model-contract'
import {
  applyModelStreamDelta,
  diffModelStream,
  type ModelStreamDelta,
  type ModelStreamSnapshot,
} from '@omne-harness/model-contract'

function must<T, F>(value: Outcome<T, F>): T {
  if ('failure' in value) throw new Error('Expected valid test value')
  return value.ok
}
function minted(account: string): TenantId {
  const result = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_' + '0'.repeat(26),
      account: 'acc_' + account.padStart(26, '0'),
    }),
  )
  if (!result.ok) throw new Error('Invalid tenant fixture')
  return result.value
}
// Decoded fixtures are built inside each test, so a decoder fault fails that test rather than
// the module load or the collection.
const tenant = minted('0')
const foreign = minted('1')
const callId = () => must(decodeModelCallId('mcall_a'))
const dispatchId = () => must(decodeDispatchId('mdisp_a'))
const otherCallId = () => must(decodeModelCallId('mcall_b'))
const otherDispatchId = () => must(decodeDispatchId('mdisp_b'))
const revision = (text: string) => must(decodeRevision(text))
const cursor = (text: string) => must(decodeOutputCursor(text))
const operationId = () => must(decodeModelOperationId('mop_a'))
const codec: StreamCallCodec = {
  producer: 'model',
  resolve({ text, tenant: target }) {
    const decoded = resolveModelInvocationRef(text, target)
    if ('failure' in decoded) return { failure: { kind: decoded.failure.kind } }
    return { ok: must(encodeModelInvocationRef(decoded.ok)) }
  },
}
function reference(stream = 'str_a', target = tenant, modelCall = callId()): StreamRef {
  return must(
    encodeStreamRef(
      {
        tenant: target,
        producer: 'model',
        call: must(
          encodeModelInvocationRef({ tenant: target, call: modelCall, admission: operationId() }),
        ),
        stream: must(decodeStreamId(stream)),
      },
      codec,
    ),
  )
}
const defaultRef = () => reference()
function state(phase: CallState['phase'] = 'running', rev = '1'): CallState {
  const common = {
    call: callId(),
    revision: revision(rev),
    consumer: { owner: 'agent', work: 'work', position: 'position', purpose: 'reply' },
    control: { kind: 'none' } as const,
    custody: { kind: 'producer' } as const,
  }
  switch (phase) {
    case 'accepted':
      return { ...common, phase }
    case 'running':
      return { ...common, phase, dispatch: dispatchId(), firstContent: 'none-proven' }
    case 'retry-decision':
      return { ...common, phase, dispatch: dispatchId() }
    case 'settled':
      return {
        ...common,
        phase,
        settlement: {
          version: must(decodeResultVersion('mrver_a')),
          termination: { kind: 'completed', reason: 'stop' },
          cursor: cursor('1'),
          source: { owner: 'source', record: 'record', revision: '1', digest: 'digest' },
        },
      }
  }
}
function growing(
  index = '2',
  value = 'a',
  mode: 'append' | 'replace' = 'append',
  content: Extract<VisibleBlock, { kind: 'growing' }>['content'] = 'text',
): VisibleBlock {
  return { kind: 'growing', index, mode, content, value }
}
function block(value: unknown): ModelBlock {
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) throw new Error('Invalid block fixture')
  return judged.ok
}
const visibility = { toHuman: true, toModel: true }
function text(value = 'a', kind: 'text' | 'thinking' = 'text'): ModelBlock {
  return block({ kind, id: 'b1', visibility: { ...visibility }, text: value })
}
function sealed(value: ModelBlock = text(), index = '2'): VisibleBlock {
  return { kind: 'sealed', index, block: value }
}
function snapshot(
  blocks: readonly VisibleBlock[] = [growing()],
  callState = state(),
  output = '1',
): ModelStreamSnapshot {
  return {
    ref: defaultRef(),
    dispatch: dispatchId(),
    value: { call: callId(), cursor: cursor(output), state: callState, blocks },
  }
}
function advance(before: ModelStreamSnapshot, blocks = before.value.blocks): ModelStreamSnapshot {
  return {
    ...before,
    value: {
      ...before.value,
      state: { ...before.value.state, revision: revision('2') },
      cursor: cursor('2'),
      blocks,
    },
  }
}
function delta(before: ModelStreamSnapshot, after: ModelStreamSnapshot): ModelStreamDelta {
  return {
    ref: after.ref,
    dispatch: after.dispatch,
    from: { outputCursor: before.value.cursor, revision: before.value.state.revision },
    state: after.value.state,
    outputCursor: after.value.cursor,
    blocks: after.value.blocks,
  }
}
function diff(before: ModelStreamSnapshot, after: ModelStreamSnapshot) {
  return diffModelStream({ tenant, before, after })
}
function apply(before: ModelStreamSnapshot, value: ModelStreamDelta) {
  return applyModelStreamDelta({ tenant, before, delta: value })
}
function roundTrip(before: ModelStreamSnapshot, after: ModelStreamSnapshot): ModelStreamDelta {
  const change = must(diff(before, after))
  expect(must(apply(before, change))).toEqual(after)
  return change
}
function pairFailure(before: ModelStreamSnapshot, after: ModelStreamSnapshot, kind: string) {
  expect(diff(before, after)).toEqual({ failure: { kind } })
  expect(apply(before, delta(before, after))).toEqual({ failure: { kind } })
}

describe('Model stream changes', () => {
  it('round-trips the fixed initial, state-only and cumulative updates', () => {
    const s0 = snapshot([], state(), '0')
    const observed: CallState = {
      ...state(),
      revision: revision('2'),
      phase: 'running',
      dispatch: dispatchId(),
      firstContent: 'observed',
    }
    const s1 = snapshot([growing()], observed)
    const change = roundTrip(s0, s1)
    expect(change).toEqual({
      ref: defaultRef(),
      dispatch: dispatchId(),
      from: { outputCursor: '0', revision: '1' },
      outputCursor: '1',
      state: observed,
      blocks: [growing()],
    })
    const requested: CallState = {
      ...observed,
      revision: revision('3'),
      control: {
        kind: 'requested',
        operation: operationId(),
        propagation: 'pending',
        upstream: 'unknown',
      },
    }
    const s2 = snapshot(s1.value.blocks, requested)
    expect(roundTrip(s1, s2).blocks).toEqual([])
    const s3 = snapshot(
      [growing('2', 'ab'), growing('5', 'z')],
      { ...requested, revision: revision('4') },
      '2',
    )
    expect(roundTrip(s2, s3).blocks).toEqual(s3.value.blocks)
  })

  it('makes a no-op delta, accepts redundant unchanged blocks and ignores object key order', () => {
    const before = snapshot([sealed()])
    const first = before.value.blocks[0]!
    const { index, ...rest } = first
    const after = {
      ...before,
      value: { ...before.value, blocks: [{ index, ...rest }] },
    }
    const change = roundTrip(before, after)
    expect(change.blocks).toEqual([])
    expect(must(apply(before, { ...change, blocks: before.value.blocks }))).toEqual(before)
    expect(roundTrip(before, before).blocks).toEqual([])
  })

  it('advances outputCursor without requiring changed blocks', () => {
    const before = snapshot()
    const after = { ...before, value: { ...before.value, cursor: cursor('2') } }
    expect(roundTrip(before, after).blocks).toEqual([])
  })

  it('selects only changed/new blocks and replaces cumulative text once', () => {
    const before = snapshot([growing('2', 'a'), growing('5', 'x')])
    const after = advance(before, [growing('2', 'ab'), growing('5', 'x'), sealed(text('z'), '9')])
    const change = roundTrip(before, after)
    expect(change.blocks.map(item => item.index)).toEqual(['2', '9'])
    const applied = must(apply(before, change))
    expect(applied.value.blocks).toEqual(after.value.blocks)
    expect(apply(applied, change)).toEqual({ failure: { kind: 'base-mismatch' } })
  })

  it('allows replace mode to erase accumulated text', () => {
    const before = snapshot([growing('2', 'a', 'replace')])
    roundTrip(before, advance(before, [growing('2', '', 'replace')]))
  })

  it('compares 256-digit revisions and cursors without losing precision', () => {
    const low = '1' + '0'.repeat(255)
    const high = '1' + '0'.repeat(254) + '1'
    const before = snapshot([], state('running', low), low)
    const after = snapshot([], state('running', high), high)
    roundTrip(before, after)
    pairFailure(after, before, 'revision-regression')
  })

  it('normalizes references through the original Model codec before comparing them', () => {
    const before = snapshot()
    const after = { ...advance(before), ref: (' ' + defaultRef() + ' ') as StreamRef }
    const change = must(diff(before, after))
    expect(change.ref).toBe(defaultRef())
    expect(must(apply(before, change)).ref).toBe(defaultRef())
  })
})

describe('reference, identity and source checks', () => {
  it('checks a minted tenant before either reference', () => {
    const before = { ...snapshot(), ref: 'invalid' as StreamRef }
    const after = advance(before)
    expect(diffModelStream({ tenant: { ...tenant }, before, after })).toEqual({
      failure: { kind: 'invalid-tenant' },
    })
    expect(
      applyModelStreamDelta({ tenant: { ...tenant }, before, delta: delta(before, after) }),
    ).toEqual({ failure: { kind: 'invalid-tenant' } })
  })

  it.each(['before', 'after'] as const)(
    'labels %s reference failures and preserves the common category',
    side => {
      const before = snapshot()
      const after = advance(before)
      const bad = { ...(side === 'before' ? before : after), ref: reference('str_a', foreign) }
      expect(diff(side === 'before' ? bad : before, side === 'after' ? bad : after)).toEqual({
        failure: { kind: 'reference', side, failure: { kind: 'foreign-tenant' } },
      })
    },
  )

  it('labels delta reference failures, rejects the other producer and hides malformed-call details', () => {
    const before = snapshot()
    const target = delta(before, advance(before))
    expect(apply(before, { ...target, ref: 'invalid' as StreamRef })).toMatchObject({
      failure: { kind: 'reference', side: 'delta', failure: { kind: 'invalid-envelope' } },
    })
    for (const [producer, invocation, kind] of [
      ['tool', 'irrelevant', 'wrong-producer'],
      ['model', 'bad invocation', 'malformed'],
    ]) {
      const bad = JSON.stringify(['stream-ref', 1, producer, invocation, 'str_a']) as StreamRef
      expect(apply(before, { ...target, ref: bad })).toEqual({
        failure: { kind: 'reference', side: 'delta', failure: { kind } },
      })
    }
  })

  it('completes both references before checking before identity or associations', () => {
    const before = { ...snapshot(), dispatch: 'bad' as DispatchId }
    const after = { ...advance(snapshot()), ref: 'bad' as StreamRef }
    expect(diff(before, after)).toMatchObject({ failure: { kind: 'reference', side: 'after' } })
    expect(apply(before, delta(snapshot(), after))).toMatchObject({
      failure: { kind: 'reference', side: 'delta' },
    })
    const mismatched = { ...snapshot(), value: { ...snapshot().value, call: otherCallId() } }
    expect(diff(mismatched, after)).toMatchObject({ failure: { kind: 'reference', side: 'after' } })
  })

  it.each(['before', 'after'] as const)(
    'checks %s identity fields in the declared priority',
    side => {
      const base = snapshot()
      const valid = advance(base)
      const stages: [ModelStreamSnapshot, string][] = [
        [
          {
            ...valid,
            dispatch: 'bad' as DispatchId,
            value: { ...valid.value, call: 'bad' as ModelCallId },
          },
          'dispatch',
        ],
        [
          {
            ...valid,
            value: {
              ...valid.value,
              call: 'bad' as ModelCallId,
              state: { ...valid.value.state, revision: 'bad' as Revision },
            },
          },
          'call',
        ],
        [
          {
            ...valid,
            value: {
              ...valid.value,
              state: { ...valid.value.state, revision: '01' as Revision },
              cursor: 'bad' as OutputCursor,
            },
          },
          'revision',
        ],
        [{ ...valid, value: { ...valid.value, cursor: '01' as OutputCursor } }, 'outputCursor'],
      ]
      for (const [bad, field] of stages) {
        expect(diff(side === 'before' ? bad : base, side === 'after' ? bad : valid)).toEqual({
          failure: { kind: 'identity', side, field },
        })
      }
    },
  )

  it.each(['running', 'retry-decision'] as const)(
    'validates the inner dispatch in %s before call',
    phase => {
      const before = snapshot()
      const current = state(phase, '2')
      if (current.phase !== 'running' && current.phase !== 'retry-decision')
        throw new Error('dispatch fixture')
      const after = snapshot(
        [],
        { ...current, dispatch: 'bad' as DispatchId, call: 'bad' as ModelCallId },
        '2',
      )
      expect(diff(before, after)).toEqual({
        failure: { kind: 'identity', side: 'after', field: 'dispatch' },
      })
    },
  )

  it.each(['before', 'after'] as const)(
    'decodes the outer dispatch of a settled %s projection, which has no inner dispatch',
    side => {
      const before = snapshot([], state('settled'))
      const after = advance(before)
      const bad = { ...(side === 'before' ? before : after), dispatch: 'bad' as DispatchId }
      const left = side === 'before' ? bad : before
      const right = side === 'after' ? bad : after
      expect(diff(left, right)).toEqual({ failure: { kind: 'identity', side, field: 'dispatch' } })
      expect(apply(left, delta(left, right))).toEqual({
        failure: {
          kind: 'identity',
          side: side === 'before' ? 'before' : 'delta',
          field: 'dispatch',
        },
      })
    },
  )

  it('validates state.call separately and checks all identities before associations', () => {
    const before = snapshot()
    const after = advance(before)
    const badCall = {
      ...after,
      value: { ...after.value, state: { ...after.value.state, call: 'bad' as ModelCallId } },
    }
    expect(diff(before, badCall)).toEqual({
      failure: { kind: 'identity', side: 'after', field: 'call' },
    })
    const mismatch = { ...before, value: { ...before.value, call: otherCallId() } }
    expect(diff(mismatch, { ...after, dispatch: 'bad' as DispatchId })).toEqual({
      failure: { kind: 'identity', side: 'after', field: 'dispatch' },
    })
  })

  it('attributes both from fields to delta identity and checks revision first', () => {
    const before = snapshot()
    const change = delta(before, advance(before))
    expect(
      apply(before, {
        ...change,
        from: { revision: '01' as Revision, outputCursor: '01' as OutputCursor },
      }),
    ).toEqual({ failure: { kind: 'identity', side: 'delta', field: 'revision' } })
    expect(
      apply(before, { ...change, from: { ...change.from, outputCursor: '01' as OutputCursor } }),
    ).toEqual({ failure: { kind: 'identity', side: 'delta', field: 'outputCursor' } })
  })

  it('associates each call and running dispatch before cross-stream checks', () => {
    const before = snapshot()
    const after = advance(before)
    pairFailure(
      before,
      { ...after, value: { ...after.value, state: { ...after.value.state, call: otherCallId() } } },
      'call-mismatch',
    )
    expect(diff(before, { ...after, value: { ...after.value, call: otherCallId() } })).toEqual({
      failure: { kind: 'call-mismatch' },
    })
    const mismatch: ModelStreamSnapshot = {
      ...after,
      ref: reference('str_b'),
      value: {
        ...after.value,
        state: {
          ...state('running', '2'),
          phase: 'running',
          dispatch: otherDispatchId(),
          firstContent: 'observed',
        },
      },
    }
    pairFailure(before, mismatch, 'dispatch-mismatch')
  })

  it('requires a retry-decision inner dispatch to equal the outer dispatch', () => {
    const before = snapshot()
    const pending = state('retry-decision', '2')
    if (pending.phase !== 'retry-decision') throw new Error('retry-decision fixture')
    const after = snapshot([growing()], { ...pending, dispatch: otherDispatchId() }, '2')
    pairFailure(before, after, 'dispatch-mismatch')
    roundTrip(before, snapshot([growing()], pending, '2'))
  })

  it.each(['before', 'after'] as const)('refuses an accepted %s projection', side => {
    const before = snapshot()
    const after = advance(before)
    const accepted = snapshot(
      [],
      state('accepted', side === 'before' ? '1' : '2'),
      side === 'before' ? '1' : '2',
    )
    pairFailure(
      side === 'before' ? accepted : before,
      side === 'after' ? accepted : after,
      'state-transition',
    )
  })

  it('rejects different streams before different outer dispatches, including settled states', () => {
    const before = snapshot([], state('settled'))
    const after = { ...advance(before), dispatch: otherDispatchId() }
    pairFailure(before, { ...after, ref: reference('str_b') }, 'stream-mismatch')
    pairFailure(before, after, 'dispatch-mismatch')
  })

  it('rejects another invocation even when all of its call fields agree', () => {
    const before = snapshot()
    const after = advance(before)
    const another = {
      ...after,
      ref: reference('str_a', tenant, otherCallId()),
      value: {
        ...after.value,
        call: otherCallId(),
        state: { ...after.value.state, call: otherCallId() },
      },
    }
    pairFailure(before, another, 'stream-mismatch')
  })

  it.each(['revision', 'outputCursor'] as const)(
    'rejects the wrong %s baseline before target regressions',
    field => {
      const before = snapshot()
      const change = delta(before, advance(before))
      const from =
        field === 'revision'
          ? { ...change.from, revision: revision('0') }
          : { ...change.from, outputCursor: cursor('0') }
      expect(
        apply(before, { ...change, from, state: { ...change.state, revision: revision('0') } }),
      ).toEqual({ failure: { kind: 'base-mismatch' } })
    },
  )
})

describe('projection progress and state', () => {
  it('orders revision, cursor, equal-revision state and equal-cursor blocks failures', () => {
    const before = snapshot()
    const after = advance(before, [growing('2', 'ab')])
    pairFailure(
      before,
      {
        ...after,
        value: {
          ...after.value,
          cursor: cursor('0'),
          state: { ...after.value.state, revision: revision('0') },
        },
      },
      'revision-regression',
    )
    pairFailure(
      before,
      {
        ...after,
        value: {
          ...after.value,
          cursor: cursor('0'),
          state: {
            ...after.value.state,
            revision: revision('1'),
            control: {
              kind: 'requested',
              operation: operationId(),
              propagation: 'pending',
              upstream: 'unknown',
            },
          },
        },
      },
      'cursor-regression',
    )
    pairFailure(
      before,
      {
        ...after,
        value: {
          ...after.value,
          cursor: cursor('1'),
          state: {
            ...after.value.state,
            revision: revision('1'),
            control: {
              kind: 'requested',
              operation: operationId(),
              propagation: 'pending',
              upstream: 'unknown',
            },
          },
        },
      },
      'state-conflict',
    )
    pairFailure(
      before,
      { ...after, value: { ...after.value, cursor: cursor('1') } },
      'block-conflict',
    )
  })

  it.each([
    ['running', 'running'],
    ['running', 'retry-decision'],
    ['running', 'settled'],
    ['retry-decision', 'retry-decision'],
    ['retry-decision', 'settled'],
    ['settled', 'settled'],
  ] as const)('allows %s to %s with retained source and consumer', (beforePhase, afterPhase) => {
    roundTrip(snapshot([], state(beforePhase)), snapshot([], state(afterPhase, '2'), '2'))
  })

  it.each([
    ['retry-decision', 'running'],
    ['settled', 'running'],
    ['settled', 'retry-decision'],
  ] as const)('rejects %s to %s before a consumer conflict', (beforePhase, afterPhase) => {
    const before = snapshot([], state(beforePhase))
    const target = state(afterPhase, '2')
    pairFailure(
      before,
      snapshot([], { ...target, consumer: { ...target.consumer, purpose: 'other' } }, '2'),
      'state-transition',
    )
  })

  it.each(['version', 'termination', 'cursor', 'source'] as const)(
    'retains the whole settlement including %s',
    field => {
      const settled = state('settled')
      if (settled.phase !== 'settled') throw new Error('settled fixture')
      const before = snapshot([], settled)
      const changes = {
        version: must(decodeResultVersion('mrver_b')),
        termination: { kind: 'completed', reason: 'limit' } as const,
        cursor: cursor('2'),
        source: { ...settled.settlement.source, digest: 'other' },
      }
      pairFailure(
        before,
        snapshot(
          [],
          {
            ...settled,
            revision: revision('2'),
            settlement: { ...settled.settlement, [field]: changes[field] },
          },
          '2',
        ),
        'state-conflict',
      )
    },
  )

  it('retains the complete consumer even when revision increases', () => {
    const before = snapshot()
    const after = advance(before)
    for (const key of ['owner', 'work', 'position', 'purpose'] as const)
      pairFailure(
        before,
        {
          ...after,
          value: {
            ...after.value,
            state: {
              ...after.value.state,
              consumer: { ...after.value.state.consumer, [key]: 'other' },
            },
          },
        },
        'state-conflict',
      )
  })
})

describe('block order and cumulative changes', () => {
  it('accepts sparse indexes through the maximum safe integer and direct sealed additions', () => {
    const before = snapshot([growing('8')])
    roundTrip(before, advance(before, [growing('8'), sealed(text('x'), '9007199254740991')]))
  })

  it.each(['01', '-1', '+1', '1.0', '1e3', '9007199254740992', '1\n', '', '9'.repeat(256)])(
    'rejects noncanonical or unsafe block index %j',
    index => {
      const before = snapshot([])
      pairFailure(before, advance(before, [growing(index)]), 'block-order')
    },
  )

  it.each([{ indexes: ['5', '2'] }, { indexes: ['2', '2'] }])(
    'rejects unordered or repeated indexes %j in targets and patches',
    ({ indexes }) => {
      const before = snapshot()
      pairFailure(
        before,
        advance(
          before,
          indexes.map(index => growing(index)),
        ),
        'block-order',
      )
    },
  )

  it('checks before order and patch order even when the constructed target hides duplicates', () => {
    const invalidBefore = snapshot([growing('5'), growing('2')])
    expect(diff(invalidBefore, advance(snapshot()))).toEqual({ failure: { kind: 'block-order' } })
    const before = snapshot()
    const change = delta(before, advance(before))
    expect(apply(before, { ...change, blocks: [growing(), growing()] })).toEqual({
      failure: { kind: 'block-order' },
    })
  })

  it('checks removal before a misplaced new index, then content changes', () => {
    const before = snapshot([growing('2'), growing('5', 'ab')])
    expect(diff(before, advance(before, [growing('3'), growing('5', 'a')]))).toEqual({
      failure: { kind: 'block-removal' },
    })
    pairFailure(
      before,
      advance(before, [growing('2'), growing('3'), growing('5', 'a')]),
      'block-order',
    )
  })

  it.each([
    { before: ['5'], after: ['3', '5'] },
    { before: ['2', '5', '8'], after: ['2', '5', '6', '8'] },
  ])('measures a new index against the last old index $before', indexes => {
    const before = snapshot(indexes.before.map(index => growing(index)))
    const after = advance(
      before,
      indexes.after.map(index => growing(index)),
    )
    expect(diff(before, after)).toEqual({ failure: { kind: 'block-order' } })
    roundTrip(before, advance(before, [...before.value.blocks, growing('9')]))
  })

  it.each([
    growing('2', ''),
    growing('2', 'b'),
    growing('2', 'ab', 'replace'),
    growing('2', 'ab', 'append', 'thinking'),
  ])('rejects shrinking text or changed growing mode/content %#', target => {
    const before = snapshot([growing('2', 'a')])
    pairFailure(before, advance(before, [target]), 'block-conflict')
  })

  it('keeps sealed values and their metadata unchanged', () => {
    const before = snapshot([sealed()])
    for (const target of [
      sealed(text('b')),
      sealed(block({ kind: 'text', id: 'b2', visibility, text: 'a' })),
      sealed(
        block({ kind: 'text', id: 'b1', visibility: { toHuman: false, toModel: true }, text: 'a' }),
      ),
      growing(),
    ])
      pairFailure(before, advance(before, [target]), 'block-conflict')
  })

  it.each(['text', 'thinking'] as const)(
    'seals %s only with matching kind and cumulative text',
    content => {
      const before = snapshot([growing('2', 'a', 'append', content)])
      roundTrip(before, advance(before, [sealed(text('ab', content))]))
      pairFailure(before, advance(before, [sealed(text('b', content))]), 'block-conflict')
      pairFailure(
        before,
        advance(before, [sealed(text('a', content === 'text' ? 'thinking' : 'text'))]),
        'block-conflict',
      )
      const replacing = snapshot([growing('2', 'a', 'replace', content)])
      roundTrip(replacing, advance(replacing, [sealed(text('', content))]))
    },
  )

  it('seals inline voice by prefix and reference voice without fetching its contents', () => {
    const inline = (body: string) =>
      block({ kind: 'voice', id: 'v1', visibility, mediaType: 'audio/raw', inline: body })
    const before = snapshot([growing('2', 'a', 'append', 'voice')])
    roundTrip(before, advance(before, [sealed(inline('ab'))]))
    pairFailure(before, advance(before, [sealed(inline('b'))]), 'block-conflict')
    pairFailure(before, advance(before, [sealed(text('a'))]), 'block-conflict')
    const referenced = block({
      kind: 'voice',
      id: 'v1',
      visibility,
      ref: { storage: 'owner', key: 'key', mediaType: 'audio/raw', bytes: '1', digest: 'digest' },
      transcript: null,
    })
    roundTrip(before, advance(before, [sealed(referenced)]))
    const replacing = snapshot([growing('2', 'a', 'replace', 'voice')])
    roundTrip(replacing, advance(replacing, [sealed(inline(''))]))
  })

  it('preserves tool JsonValue number lexemes and ordered object entries', () => {
    const argumentsValue: JsonValue = {
      kind: 'object',
      entries: [
        { key: 'n', value: { kind: 'number', lexeme: '900719925474099312345' } },
        {
          key: 'a',
          value: { kind: 'array', items: [{ kind: 'boolean', value: true }, { kind: 'null' }] },
        },
      ],
    }
    const tool: ModelBlock = {
      kind: 'tool_call',
      id: text().id,
      visibility,
      callId: 'toolcall',
      name: 'tool',
      arguments: argumentsValue,
    }
    const before = snapshot([growing('2', '{', 'append', 'tool-arguments')])
    const after = advance(before, [sealed(tool)])
    const change = roundTrip(before, after)
    expect(change.blocks).toEqual([sealed(tool)])
    pairFailure(before, advance(before, [sealed(text())]), 'block-conflict')
    const fixed = snapshot([sealed(tool)])
    pairFailure(
      fixed,
      advance(fixed, [
        sealed({
          ...tool,
          arguments: { kind: 'object', entries: [...argumentsValue.entries].reverse() },
        }),
      ]),
      'block-conflict',
    )
    const lexical: ModelBlock = { ...tool, arguments: { kind: 'number', lexeme: '1.0' } }
    const lexicalBefore = snapshot([sealed(lexical)])
    pairFailure(
      lexicalBefore,
      advance(lexicalBefore, [sealed({ ...tool, arguments: { kind: 'number', lexeme: '1' } })]),
      'block-conflict',
    )
  })
})

describe('value isolation', () => {
  function expectFrozen(value: unknown): void {
    if (typeof value !== 'object' || value === null) return
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) expectFrozen(child)
  }

  it('clones and freezes each DAG occurrence while leaving both inputs mutable', () => {
    const shared = { kind: 'string', value: 'original' } satisfies JsonValue
    const args = { kind: 'array', items: [shared, shared] } satisfies JsonValue
    const tool: ModelBlock = {
      kind: 'tool_call',
      id: text().id,
      visibility: { ...visibility },
      callId: 'tc',
      name: 'tool',
      arguments: args,
    }
    const before = snapshot([])
    const after = advance(before, [sealed(tool)])
    const change = must(diff(before, after))
    const result = must(apply(before, change))
    expectFrozen(change)
    expectFrozen(result)
    expect(Object.isFrozen(after)).toBe(false)
    expect(Object.isFrozen(args)).toBe(false)
    const copiedBlock = change.blocks[0]
    if (
      copiedBlock?.kind !== 'sealed' ||
      copiedBlock.block.kind !== 'tool_call' ||
      copiedBlock.block.arguments.kind !== 'array'
    )
      throw new Error('tool fixture')
    const items = copiedBlock.block.arguments.items
    expect(items[0]).not.toBe(items[1])
    expect(items[0]).not.toBe(shared)
    const saved = structuredClone(result)
    shared.value = 'changed'
    args.items.push(shared)
    expect(result).toEqual(saved)
    expect(copiedBlock.block.arguments).toEqual({
      kind: 'array',
      items: [
        { kind: 'string', value: 'original' },
        { kind: 'string', value: 'original' },
      ],
    })
  })

  it('does not modify or freeze input on failure and returns no partial snapshot', () => {
    const before = snapshot()
    const after = advance(before)
    const savedBefore = structuredClone(before)
    const savedAfter = structuredClone(after)
    const change = {
      ...delta(before, after),
      from: { revision: revision('0'), outputCursor: cursor('1') },
    }
    expect(apply(before, change)).toEqual({ failure: { kind: 'base-mismatch' } })
    expect(before).toEqual(savedBefore)
    expect(after).toEqual(savedAfter)
    expect(Object.isFrozen(before.value.blocks)).toBe(false)
    expect(Object.isFrozen(change)).toBe(false)
    expect(diff(before, { ...after, value: { ...after.value, blocks: [] } })).toEqual({
      failure: { kind: 'block-removal' },
    })
    expect(before).toEqual(savedBefore)
  })

  it('preserves nested arrays, ordered entries and member order in independent copies', () => {
    const items: JsonValue[] = [
      { kind: 'null' },
      { kind: 'boolean', value: false },
      { kind: 'number', lexeme: '9007199254740993' },
      { kind: 'array', items: [] },
    ]
    const shared = { items, kind: 'array' } satisfies JsonValue
    const args = {
      entries: [
        { value: shared, key: 'second' },
        { value: shared, key: 'first' },
      ],
      kind: 'object',
    } satisfies JsonValue
    const tool: ModelBlock = {
      arguments: args,
      kind: 'tool_call',
      name: 'tool',
      callId: 'tc',
      id: text().id,
      visibility: { ...visibility },
    }
    const before = snapshot([])
    const after = advance(before, [sealed(tool)])
    const change = must(diff(before, after))
    const result = must(apply(before, change))
    for (const copy of [change.blocks[0], result.value.blocks[0]]) {
      if (copy?.kind !== 'sealed' || copy.block.kind !== 'tool_call')
        throw new Error('tool fixture')
      const copiedArgs = copy.block.arguments
      if (copiedArgs.kind !== 'object') throw new Error('object fixture')
      expect(copiedArgs).toStrictEqual(args)
      expect(Object.keys(copy.block)).toEqual(Object.keys(tool))
      expect(Object.keys(copiedArgs)).toEqual(Object.keys(args))
      expect(copiedArgs.entries.map(entry => entry.key)).toEqual(['second', 'first'])
      const [first, second] = copiedArgs.entries
      if (first?.value.kind !== 'array' || second?.value.kind !== 'array')
        throw new Error('array fixture')
      expect(Array.isArray(first.value.items)).toBe(true)
      expect(first.value.items).not.toBe(items)
      expect(first.value.items).not.toBe(second.value.items)
      expectFrozen(copy)
    }
    items.push({ kind: 'string', value: 'later' })
    expect(Object.isFrozen(items)).toBe(false)
    expect(change.blocks).toStrictEqual(result.value.blocks)
  })

  it('retains an explicit undefined member when copying a successful value', () => {
    const extended = { ...text(), extra: undefined }
    const before = snapshot([])
    const after = advance(before, [sealed(extended)])
    const change = must(diff(before, after))
    const result = must(apply(before, change))
    for (const copy of [change.blocks[0], result.value.blocks[0]]) {
      if (copy?.kind !== 'sealed') throw new Error('sealed fixture')
      expect(copy.block).toStrictEqual(extended)
      expect(Object.hasOwn(copy.block, 'extra')).toBe(true)
      expectFrozen(copy)
    }
    expect(Object.isFrozen(extended)).toBe(false)
  })

  it('copies retained blocks from before when the delta changes only state', () => {
    const mutable = {
      kind: 'growing',
      index: '0',
      mode: 'append',
      content: 'text',
      value: 'a',
    } satisfies VisibleBlock
    const before = snapshot([mutable])
    const after = advance(before)
    const change = must(diff(before, after))
    expect(change.blocks).toEqual([])
    const result = must(apply(before, change))
    expect(result.value.blocks[0]).not.toBe(mutable)
    mutable.value = 'caller edit'
    expect(result.value.blocks).toEqual([{ ...mutable, value: 'a' }])
    expect(Object.isFrozen(mutable)).toBe(false)
  })

  it('distinguishes absent members from explicit undefined while ignoring object member order', () => {
    const before = snapshot([sealed(text())])
    const target = advance(before)
    const existing = target.value.blocks[0]
    if (existing?.kind !== 'sealed') throw new Error('sealed fixture')
    const reordered = {
      ...existing,
      block: Object.fromEntries(Object.entries(existing.block).reverse()) as ModelBlock,
    }
    expect(
      roundTrip(before, { ...target, value: { ...target.value, blocks: [reordered] } }).blocks,
    ).toEqual([])
    const explicit = { ...existing, block: { ...existing.block, extra: undefined } }
    pairFailure(
      before,
      { ...target, value: { ...target.value, blocks: [explicit] } },
      'block-conflict',
    )
  })
})
