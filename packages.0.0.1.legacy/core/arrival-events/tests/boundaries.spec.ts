import { describe, expect, test } from 'vitest'
import { jsonNumberSource, type JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  judgeArrivalEnvelope,
  judgeArrivalEnvelopeText,
  validate,
  type OpenEvent,
  type OpenBlock,
} from '../src/index.ts'
import {
  modelTarget,
  frameTarget,
  visibility,
  frameVisibility,
  opened,
  image,
  json,
  usage,
  cost,
} from './fixtures.ts'

describe('V-3 optional opened view and per-kind replacement predicates', () => {
  for (const kind of [
    'text',
    'thinking',
    'tool_call',
    'voice',
    'image',
    'file',
    'tool_result',
  ] as const) {
    const base = { t: 'open', index: 0, id: 'b_1', visibility, kind, fill: 'replace' }
    // CallId/BlockId are obtained from their provider; views below are legal typed facts.
    const common = { t: 'open', index: 0, id: image().id, visibility } as const
    let view: OpenEvent
    if (kind === 'voice') view = opened('voice', 'replace')
    else if (kind === 'tool_call') {
      view = { ...common, kind, fill: 'replace', head: { callId: validCallId(), tool: 't' } }
    } else if (kind === 'tool_result') view = { ...common, kind, fill: 'replace' }
    else if (kind === 'image' || kind === 'file')
      view = {
        ...common,
        kind,
        fill: 'replace',
        ...(kind === 'image' ? { head: { mediaType: 'image/png' } } : {}),
      }
    else view = opened(kind, 'replace')
    test(`${kind} present/missing/unknown view, same invalid payload`, () => {
      const envelope = {
        target: modelTarget,
        event: {
          t: 'fill',
          index: 0,
          payload: kind === 'image' || kind === 'file' || kind === 'tool_result' ? '' : image(),
        },
      }
      expect(judgeArrivalEnvelope(envelope)).toEqual({ ok: true })
      expect(judgeArrivalEnvelope(envelope, () => undefined)).toEqual({ ok: true })
      expect(judgeArrivalEnvelope(envelope, () => view)).toEqual({
        rejected: 'replace_payload_shape',
      })
      expect(base.fill).toBe('replace')
    })
  }
  for (const fill of ['append', 'replace'] as const) {
    test(`frame voice ${fill} is inline even before replace-shape errors`, () => {
      const event = { t: 'fill', index: 0, payload: 'not base64!' }
      expect(judgeArrivalEnvelope({ target: frameTarget, event })).toEqual({ ok: true })
      expect(judgeArrivalEnvelope({ target: frameTarget, event }, () => undefined)).toEqual({
        ok: true,
      })
      expect(
        judgeArrivalEnvelope({ target: frameTarget, event }, () => opened('voice', fill, true)),
      ).toEqual({ rejected: 'frame_media_inline' })
    })
    test(`append ${fill} view never parses tool parameter raw text`, () => {
      expect(
        judgeArrivalEnvelope(
          { target: modelTarget, event: { t: 'fill', index: 0, payload: '{"a":1,"a":2}' } },
          () => opened('text', fill),
        ),
      ).toEqual({ ok: true })
    })
  }
  for (const change of ['kind', 'id', 'toHuman', 'toModel', 'mediaType'] as const) {
    test(`whole replacement ${change} must match open facts`, () => {
      const view: OpenEvent = {
        ...opened('text', 'replace'),
        kind: 'image',
        fill: 'replace',
        head: { mediaType: 'image/png' },
      }
      const data = image()
      const payload =
        change === 'kind'
          ? {
              kind: 'file',
              id: data.id,
              visibility,
              attachment: { storage: 's', key: 'k', mediaType: 'image/png' },
            }
          : change === 'id'
            ? { ...data, id: 'other' }
            : change === 'mediaType'
              ? { ...data, mediaType: 'image/jpeg' }
              : { ...data, visibility: { ...visibility, [change]: false } }
      expect(
        judgeArrivalEnvelope(
          { target: modelTarget, event: { t: 'fill', index: 0, payload } },
          () => view,
        ),
      ).toEqual({ rejected: 'replace_payload_shape' })
    })
  }
  test('opened callback receives precise original index once; other events and malformed indices do not consult it', () => {
    const calls: JsonNumber[] = []
    const read: OpenBlock = index => {
      calls.push(index)
      return Object.freeze({ ...opened('text', 'replace'), index })
    }
    const envelope = json(
      '{"target":{"kind":"model_call","callId":"m","dispatch":1},"event":{"t":"fill","index":9007199254740993,"payload":""}}',
    )
    expect(judgeArrivalEnvelope(envelope, read)).toEqual({ ok: true })
    expect(calls.map(jsonNumberSource)).toEqual(['9007199254740993'])
    for (const event of [
      { t: 'fill', index: -1, payload: 'a' },
      { t: 'fill', index: '0', payload: 'a' },
      { t: 'close', index: 0 },
      { t: 'finish', reason: 'end' },
      opened('text', 'append'),
    ])
      judgeArrivalEnvelope({ target: modelTarget, event }, read)
    expect(calls).toHaveLength(1)
  })
})

import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
function validCallId() {
  const value = parseOpaqueIdentifier('c', 'CallId')
  if ('invalidInput' in value) throw new Error('invalid call fixture')
  return value.ok
}

describe('V-2 multiple faults preserve embedded names and ordered root causes', () => {
  const cases: readonly {
    readonly name: string
    readonly event: unknown
    readonly rejected: string
    readonly frame?: true
  }[] = [
    {
      name: 'unknown t dominates any trim-like reason',
      event: { t: 'new', reason: 'bad' },
      rejected: 'event_unknown',
    },
    {
      name: 'unknown finish reason dominates bad error',
      event: { t: 'finish', reason: 'bad', error: { cause: 'bad' } },
      rejected: 'finish_reason_unknown',
    },
    {
      name: 'unknown trim reason dominates absent required counters',
      event: { t: 'trim', reason: 'bad', merged: 0 },
      rejected: 'trim_reason_unknown',
    },
    {
      name: 'embedded visibility dominates presentation/head/fill',
      event: {
        ...opened('text', 'append'),
        kind: 'image',
        visibility: { toHuman: true },
        head: { presentation: null, mediaType: 'audio/wav' },
      },
      rejected: 'visibility_missing',
    },
    {
      name: 'presentation dominates head/fill and malformed',
      event: {
        ...opened('text', 'append'),
        kind: 'image',
        head: { presentation: { hint: '' }, mediaType: 'audio/wav' },
        extra: 1,
      },
      rejected: 'presentation_invalid',
    },
    {
      name: 'head modality dominates append and malformed',
      event: {
        ...opened('text', 'append'),
        kind: 'image',
        head: { mediaType: 'audio/wav' },
        extra: 1,
      },
      rejected: 'head_modality_mismatch',
    },
    {
      name: 'append whole dominates malformed header',
      event: { ...opened('text', 'append'), kind: 'file', head: { tool: 'bad' } },
      rejected: 'fill_kind_not_appendable',
    },
    {
      name: 'embedded kind dominates inline and malformed visible frame',
      event: {
        t: 'close',
        index: 0,
        block: { kind: 'new', id: 'b', visibility, data: { inline: 'YQ==' } },
      },
      rejected: 'kind_unknown',
      frame: true,
    },
    {
      name: 'embedded media mismatch dominates frame inline',
      event: {
        t: 'close',
        index: 0,
        block: { ...image(true), mediaType: 'audio/wav', data: { inline: 'YQ==' } },
      },
      rejected: 'modality_mismatch',
      frame: true,
    },
    {
      name: 'negative cost dominates unknown usage source',
      event: {
        t: 'account',
        usage: {
          ...usage,
          input_tokens: 'unknown',
          output_tokens: 'unknown',
          cache_read_tokens: 'unknown',
          cache_write_tokens: 'unknown',
        },
        cost: { ...cost, cost_usd: -1 },
      },
      rejected: 'negative_amount',
    },
    {
      name: 'unknown source dominates malformed cost',
      event: { t: 'account', usage: { ...usage, source: 'none' }, cost: {} },
      rejected: 'unknown_with_source',
    },
    {
      name: 'malformed source is not silently corrected',
      event: { t: 'account', usage: { ...usage, source: 'guess' }, cost },
      rejected: 'malformed',
    },
  ]
  for (const c of cases)
    test(c.name, () =>
      expect(
        judgeArrivalEnvelope({ target: c.frame ? frameTarget : modelTarget, event: c.event }),
      ).toEqual({ rejected: c.rejected }),
    )
  test('embedded call-in-result name is carried unchanged', () => {
    const block = {
      kind: 'tool_result',
      id: 'b_1',
      visibility: frameVisibility,
      callId: 'c',
      outcome: 'completed',
      blocks: [{ kind: 'tool_call', id: 'b2', visibility, complete: false, rawArguments: '' }],
    }
    expect(
      judgeArrivalEnvelope({ target: frameTarget, event: { t: 'close', index: 0, block } }),
    ).toEqual({ rejected: 'incomplete_call_visible' })
    expect(
      judgeArrivalEnvelope({
        target: frameTarget,
        event: {
          t: 'close',
          index: 0,
          block: {
            ...block,
            blocks: [
              {
                ...block.blocks[0],
                visibility: frameVisibility,
                complete: true,
                callId: 'c',
                tool: 'x',
                arguments: {},
              },
            ],
          },
        },
      }),
    ).toEqual({ rejected: 'call_in_result' })
  })
})

describe('S-23 actual content tree only, any depth and container visibility', () => {
  const inline = { ...image(true), data: { inline: 'YQ==' } }
  const result = {
    kind: 'tool_result',
    id: 'result',
    visibility: frameVisibility,
    callId: 'c',
    outcome: 'completed',
    blocks: [inline],
  }
  const derived = {
    kind: 'file',
    id: 'file',
    visibility: frameVisibility,
    attachment: { storage: 's', key: 'k', mediaType: 'application/octet-stream' },
    renderings: [{ producedBy: 'system', blocks: [inline] }],
    transcript: 'derived',
  }
  for (const [name, block] of [
    ['inline root', inline],
    ['inside result', result],
    ['inside rendering', derived],
    ['rendering inside result', { ...result, blocks: [derived] }],
  ] as const) {
    for (const t of ['fill', 'close'] as const)
      test(`${t} ${name}`, () => {
        const event = t === 'fill' ? { t, index: 0, payload: block } : { t, index: 0, block }
        expect(judgeArrivalEnvelope({ target: frameTarget, event })).toEqual({
          rejected: 'frame_media_inline',
        })
        expect(judgeArrivalEnvelope({ target: modelTarget, event })).toEqual({ ok: true })
      })
  }
  test('child true visibility is legitimate under a frame container false', () => {
    const block = { ...result, blocks: [image()] }
    expect(
      judgeArrivalEnvelope({ target: frameTarget, event: { t: 'close', index: 0, block } }),
    ).toEqual({ ok: true })
  })
  test('opaque thinking JSON is not inspected as a content subtree', () => {
    const block = {
      kind: 'thinking',
      id: 'b',
      visibility: frameVisibility,
      text: 'x',
      opaque: { kind: 'image', data: { inline: 'YQ==' } },
    }
    expect(
      judgeArrivalEnvelope({ target: frameTarget, event: { t: 'close', index: 0, block } }),
    ).toEqual({ ok: true })
  })
  test('frame voice open-and-close attachment is legal; missing fill bytes is not invented', () => {
    expect(
      judgeArrivalEnvelope({ target: frameTarget, event: opened('voice', 'append', true) }),
    ).toEqual({ ok: true })
    const block = {
      kind: 'voice',
      id: 'b_1',
      visibility: frameVisibility,
      mediaType: 'audio/pcm',
      data: { storage: 's', key: 'k', mediaType: 'audio/pcm' },
    }
    expect(
      judgeArrivalEnvelope({ target: frameTarget, event: { t: 'close', index: 0, block } }),
    ).toEqual({ ok: true })
  })
})

describe('no mutation, repair or hidden sequence acceptance', () => {
  test('freeze entire caller view and observe no side effect from judgment', () => {
    const view = Object.freeze({
      ...opened('text', 'replace'),
      visibility: Object.freeze({ ...visibility }),
    })
    const event = Object.freeze({ t: 'fill', index: 0, payload: '' })
    const envelope = Object.freeze({ target: Object.freeze({ ...modelTarget }), event })
    expect(judgeArrivalEnvelope(envelope, () => view)).toEqual({ ok: true })
    expect(view.visibility.toModel).toBe(true)
    expect(Object.isFrozen(judgeArrivalEnvelope(envelope))).toBe(true)
  })
  for (const envelope of [
    null,
    undefined,
    [],
    {},
    { target: modelTarget, event: {} },
    { target: modelTarget, event: { t: 'fill', index: 0, payload: undefined } },
    { target: modelTarget, event: { t: 'finish', reason: 'end', extra: 1 } },
  ])
    test(`malformed ${JSON.stringify(envelope)}`, () =>
      expect(judgeArrivalEnvelope(envelope)).toEqual({ rejected: 'malformed' }))
  test('unknown sequence state leaves shape result unchanged: duplicate opens/accounts, late fills and missing close block belong to consumer', () => {
    for (const event of [
      opened('text', 'append'),
      { t: 'account', usage, cost },
      { t: 'fill', index: 0, payload: '' },
      { t: 'close', index: 0 },
    ]) {
      expect(judgeArrivalEnvelope({ target: modelTarget, event })).toEqual({ ok: true })
      expect(judgeArrivalEnvelope({ target: modelTarget, event })).toEqual({ ok: true })
    }
  })
  test('getters are rejected without invoking them, cycles and class instances cannot masquerade as JSON', () => {
    let reads = 0
    const event = {
      get t() {
        reads++
        return 'finish'
      },
      reason: 'end',
    }
    expect(judgeArrivalEnvelope({ target: modelTarget, event })).toEqual({ rejected: 'malformed' })
    expect(reads).toBe(0)
    const cyclic: Record<string, unknown> = { target: modelTarget }
    cyclic.event = cyclic
    expect(judgeArrivalEnvelope(cyclic)).toEqual({ rejected: 'malformed' })
    class Event {
      t = 'finish'
      reason = 'end'
    }
    expect(judgeArrivalEnvelope({ target: modelTarget, event: new Event() })).toEqual({
      rejected: 'malformed',
    })
  })
})

describe('exact JSON numbers and frozen closed enums', () => {
  for (const index of [
    '9007199254740993',
    '1e999',
    '1.0000000000000000000001',
    '-1e-999',
    '-0',
    '0.0',
  ])
    test(`index literal ${index}`, () => {
      const value = json(`{"t":"fill","index":${index},"payload":"x"}`)
      expect(validate('FillEvent', value).valid).toBe(
        !['1.0000000000000000000001', '-1e-999'].includes(index),
      )
    })
  for (const costNumber of ['1e-999', '1e999', '-1e-999', '-0'])
    test(`billed amount ${costNumber}`, () => {
      const text = `{"target":{"kind":"model_call","callId":"m","dispatch":1},"event":{"t":"account","usage":{"input_tokens":9007199254740993,"output_tokens":1,"cache_read_tokens":0,"cache_write_tokens":0,"source":"upstream"},"cost":{"cost_usd":${costNumber},"source":"upstream_usage"}}}`
      expect(judgeArrivalEnvelopeText(text)).toEqual(
        costNumber === '-1e-999' ? { rejected: 'negative_amount' } : { ok: true },
      )
    })
  for (const [ordinal, text] of [
    '{"target":{"kind":"model_call","kind":"tool_execution","callId":"c","dispatch":1},"event":{"t":"finish","reason":"end"}}',
    '{"target":{"kind":"model_call","callId":"c","dispatch":1},"event":{"t":"close","index":0,"block":{"kind":"thinking","id":"b","visibility":{"toHuman":true,"toModel":true},"text":"x","opaque":{"a":{"b":1,"b":2}}}}}',
    '{"target":{"kind":"model_call","callId":"c","dispatch":1},"event":{"t":"account","usage":{"input_tokens":1,"output_tokens":1,"cache_read_tokens":0,"cache_write_tokens":0,"source":"upstream"},"cost":{"cost_usd":1,"cost_usd":2,"source":"upstream_usage"}}}',
  ].entries())
    test(`nested duplicate members case${ordinal}`, () =>
      expect(judgeArrivalEnvelopeText(text)).toEqual({ rejected: 'malformed' }))
  test('all kind/mode/finish enums cover exactly their frozen tokens', () => {
    for (const kind of ['text', 'thinking', 'voice', 'image', 'file', 'tool_call', 'tool_result'])
      expect(validate('BlockKind', kind).valid).toBe(true)
    for (const fill of ['append', 'replace']) expect(validate('FillMode', fill).valid).toBe(true)
    for (const reason of ['end', 'max_tokens', 'interrupted', 'lost'])
      expect(validate('FinishReason', reason).valid).toBe(true)
    for (const [def, value] of [
      ['BlockKind', 'video'],
      ['FillMode', 'merge'],
      ['FinishReason', 'failed'],
    ] as const)
      expect(validate(def, value).valid).toBe(false)
  })
})
