import { describe, expect, it } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { accept } from '../src/index.ts'
import { closeOut, snapshot, start } from '../src/operations.ts'
import type { AssemblyState } from '../src/state.ts'
import { canonical } from './helpers.ts'

function state(): AssemblyState {
  const result = start({ kind: 'model_call', callId: 'mc_priority', dispatch: 1 })
  if ('rejected' in result) throw new Error('bad test target')
  return result.ok
}
function open(previous: AssemblyState, event: unknown): AssemblyState {
  const result = accept(previous, event)
  if ('rejected' in result) throw new Error(`bad prefix ${result.rejected}`)
  return result.ok
}
const visibility = { toHuman: true, toModel: true }
function text(index: unknown = 0, fill = 'append') {
  return { t: 'open', index, kind: 'text', fill, id: 'b', visibility }
}
function voice(fill = 'append') {
  return {
    t: 'open',
    index: 0,
    kind: 'voice',
    fill,
    id: 'v',
    visibility,
    head: { mediaType: 'audio/wav' },
  }
}
function refuses(previous: AssemblyState, event: unknown, rejected: string) {
  const before = canonical(snapshot(previous))
  const beforeSettlement = canonical(closeOut(previous))
  expect(accept(previous, event)).toEqual({ rejected })
  expect(canonical(snapshot(previous))).toEqual(before)
  expect(canonical(closeOut(previous))).toEqual(beforeSettlement)
}

describe('S-24/S-25 representation and sequence competition', () => {
  it.each([
    [{ t: 'unknown', reason: 'unknown' }, 'event_unknown'],
    [{ t: 'trim', reason: 'unknown' }, 'trim_reason_unknown'],
    [{ t: 'finish', reason: 'unknown' }, 'finish_reason_unknown'],
    [{ t: 'open', index: 0, kind: 'text', fill: 'append', id: 'b' }, 'visibility_missing'],
    [
      {
        t: 'open',
        index: 0,
        kind: 'voice',
        fill: 'append',
        id: 'v',
        visibility,
        head: { mediaType: 'image/png', presentation: { hint: 'x' } },
      },
      'presentation_invalid',
    ],
    [
      {
        t: 'open',
        index: 0,
        kind: 'image',
        fill: 'append',
        id: 'i',
        visibility,
        head: { mediaType: 'audio/wav' },
      },
      'head_modality_mismatch',
    ],
    [
      { t: 'open', index: 0, kind: 'image', fill: 'append', id: 'i', visibility },
      'fill_kind_not_appendable',
    ],
    [{ t: 'fill', index: -1, payload: '' }, 'malformed'],
  ] as const)('PRIORITY-01 representation %s precedes finish/index guards', (event, expected) => {
    const finished = open(open(state(), text()), { t: 'finish', reason: 'end' })
    refuses(finished, event, expected)
  })
  it('PRIORITY-02 named embedded block refusal precedes contextual replacement mismatch', () => {
    const previous = open(state(), text(0, 'replace'))
    refuses(previous, { t: 'fill', index: 0, payload: { kind: 'unknown' } }, 'kind_unknown')
    refuses(
      previous,
      { t: 'fill', index: 0, payload: { kind: 'text', id: 'x', text: '' } },
      'visibility_missing',
    )
  })
  it('PRIORITY-03 contextual replacement remains before finish only while its block is still open', () => {
    const previous = open(state(), text(0, 'replace'))
    const finished = open(previous, { t: 'finish', reason: 'end' })
    refuses(finished, { t: 'fill', index: 0, payload: 7 }, 'replace_payload_shape')
    const closed = open(previous, {
      t: 'close',
      index: 0,
      block: { kind: 'text', id: 'b', visibility, text: '' },
    })
    refuses(
      closed,
      {
        t: 'fill',
        index: 0,
        payload: {
          kind: 'image',
          id: 'i',
          visibility,
          mediaType: 'image/png',
          data: { inline: 'AQ==' },
        },
      },
      'block_already_closed',
    )
  })
  it('PRIORITY-04 embedded negative amount precedes account duplication and finish', () => {
    const valid = {
      t: 'account',
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        source: 'upstream',
      },
      cost: { cost_usd: 1, source: 'upstream_usage' },
    }
    const previous = open(open(state(), valid), { t: 'finish', reason: 'end' })
    refuses(
      previous,
      {
        ...valid,
        usage: { ...valid.usage, input_tokens: -1 },
        cost: { ...valid.cost, cost_usd: 'unknown' },
      },
      'negative_amount',
    )
  })
  it.each(['AR==', 'AAF=', 'AQ', 'AQ===', ' AQ==', 'AQ==\n', '-', ''])(
    'PRIORITY-05 strict append-voice payload %j is rejected without repair',
    payload => {
      refuses(open(state(), voice()), { t: 'fill', index: 0, payload }, 'payload_kind_mismatch')
    },
  )
  it('PRIORITY-06 sequence ownership precedes append payload validation', () => {
    refuses(open(state(), voice()), { t: 'fill', index: 4, payload: 'bad' }, 'block_not_open')
    const closed = open(open(state(), voice()), {
      t: 'close',
      index: 0,
      block: {
        kind: 'voice',
        id: 'v',
        visibility,
        mediaType: 'audio/wav',
        data: { inline: 'AQ==' },
      },
    })
    refuses(closed, { t: 'fill', index: 0, payload: 'bad' }, 'block_already_closed')
  })
  it('INDEX-01 -0/0 and exponent aliases are mathematical reuse before monotonicity', () => {
    const zero = open(state(), text(new LosslessNumber('-0')))
    refuses(zero, text(new LosslessNumber('0.0')), 'index_reused')
    const huge = open(state(), text(new LosslessNumber('1e400')))
    refuses(huge, text(new LosslessNumber('10e399')), 'index_reused')
    refuses(huge, text(new LosslessNumber('9e399')), 'index_not_monotonic')
  })
  it('INDEX-02 adjacent integers above 2^53 remain distinct and IDs belong to the message boundary', () => {
    let current = open(state(), text(new LosslessNumber('9007199254740992')))
    current = open(current, text(new LosslessNumber('9007199254740993')))
    expect(snapshot(current).blocks).toHaveLength(2)
    // Both IDs intentionally equal: block ID uniqueness belongs to data.messages, not SA.
    const before = snapshot(current)
    current = open(current, {
      t: 'fill',
      index: new LosslessNumber('9007199254740993.0'),
      payload: 'second only',
    })
    expect(snapshot(current).blocks[1]).toMatchObject({ content: 'second only' })
    expect(Object.hasOwn(snapshot(current).blocks[0] ?? {}, 'content')).toBe(false)
    expect(canonical(before)).not.toEqual(canonical(snapshot(current)))
  })
  it('OWNERSHIP-01 rejects accessors without invoking them or changing any prior state', () => {
    let calls = 0
    const event = {
      t: 'fill',
      index: 0,
      get payload() {
        calls++
        return 'side effect'
      },
    }
    refuses(open(state(), text()), event, 'malformed')
    expect(calls).toBe(0)
  })
})
