import { describe, expect, it } from 'vitest'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  readOpaqueJson,
} from '@omne-harness-lite/content-blocks'
import {
  judgeMessage,
  judgeMessageInLog,
  judgeMessageText,
  judgeModelInvocationRecord,
  judgeModelInvocationRecordText,
  validate,
  isReadable,
} from '@omne-harness-lite/messages'
import { at, text, logged, ref } from './helpers.ts'

function data(source: string) {
  const r = readJsonStrict(source)
  if ('failed' in r) throw new Error('bad test JSON')
  return r.ok
}
const record = {
  kind: 'model_call_dispatched',
  call: 'mc',
  dispatch: 1,
  provider: 'provider-x',
  response: 'rsp',
  profile: { origin: 'official', routeName: 'vendor/chat' },
  profileSnapshot: {
    providers: ['provider-x'],
    allowFallback: true,
    inputModalities: ['text'],
    outputModalities: ['text'],
    maxInputTokens: 100,
    maxOutputTokens: 50,
    updatedAt: at,
  },
  parameters: { reasoningEffort: 'max', maxOutputTokens: 50, extra: { top_k: 40 } },
  selectedBy: 'session',
  credentialScope: { layer: 'factory' },
}
describe('V3 full nested block tree and ordered first-stage predicates', () => {
  it('detects duplicates across roots, nested results and derived renderings', () => {
    const nested = {
      id: 'result',
      kind: 'tool_result',
      visibility: { toHuman: true, toModel: true },
      callId: 'c',
      outcome: 'completed',
      blocks: [
        text('same'),
        {
          id: 'child',
          kind: 'tool_result',
          visibility: { toHuman: true, toModel: true },
          callId: 'different',
          outcome: 'completed',
          blocks: [text('same')],
        },
      ],
    }
    expect(
      judgeMessage({ id: 'm', type: 'tool', callId: 'c', createdAt: at, blocks: [nested] }),
    ).toEqual({ rejected: 'block_id_duplicate' })
    const image = {
      id: 'same',
      kind: 'image',
      visibility: { toHuman: true, toModel: true },
      mediaType: 'image/png',
      data: { inline: 'eA==' },
      renderings: [{ producedBy: 'system', blocks: [text('same')] }],
      transcript: 'same',
    }
    expect(judgeMessage({ id: 'm', type: 'user', createdAt: at, blocks: [image] })).toEqual({
      rejected: 'block_id_duplicate',
    })
    expect(
      judgeMessage({
        id: 'm',
        type: 'user',
        createdAt: at,
        blocks: [{ ...image, id: 'different' }, text('same')],
      }),
    ).toEqual({ rejected: 'block_id_duplicate' })
  })
  it('does not traverse payload/arguments/opaque data as message blocks', () => {
    const m = judgeMessage({
      id: 'm',
      type: 'assistant',
      response: 'rsp',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'b',
          kind: 'tool_call',
          complete: true,
          callId: 'c',
          tool: 't',
          visibility: { toHuman: true, toModel: true },
          arguments: { id: 'b', kind: 'unknown', blocks: [text('b')] },
        },
      ],
    })
    expect('ok' in m).toBe(true)
  })
  it('chooses globally highest block rejection across different roots rather than first encountered', () => {
    const missing = { id: 'b1', kind: 'text', text: 'x' },
      unknown = { id: 'b2', kind: 'alien', visibility: { toHuman: true, toModel: true } }
    for (const blocks of [
      [missing, unknown],
      [unknown, missing],
    ]) {
      const value = { id: 'm', type: 'user', createdAt: at, blocks }
      expect(judgeMessage(value)).toEqual({ rejected: 'kind_unknown' })
      expect(judgeMessageInLog(value, [])).toEqual({ rejected: 'kind_unknown' })
    }
  })
  it('remaining malformed blocks cannot suppress an earlier message-level duplicate/count violation', () => {
    expect(
      judgeMessage({
        id: 'm',
        type: 'tool',
        createdAt: at,
        blocks: [
          { id: 'b', kind: 'tool_result', visibility: { toHuman: true, toModel: true } },
          { id: 'b', kind: 'text', visibility: { toHuman: true, toModel: true } },
        ],
      }),
    ).toEqual({ rejected: 'block_id_duplicate' })
  })
  it('derived readability uses every containing block and names descendants independently', () => {
    const make = (visible: boolean) =>
      logged({
        id: 'm',
        type: 'user',
        createdAt: at,
        blocks: [
          {
            id: 'image',
            kind: 'image',
            visibility: { toHuman: true, toModel: visible },
            mediaType: 'image/png',
            data: { inline: 'eA==' },
            renderings: [{ producedBy: 'system', blocks: [text('rendered')] }],
            transcript: 'text',
          },
        ],
      })
    expect(isReadable(ref('m', 'rendered'), [make(false)])).toBe(false)
    expect(isReadable(ref('m', 'rendered'), [make(true)])).toBe(true)
  })
})
describe('V13 strict text and exact arbitrary JSON numbers', () => {
  for (const body of [
    '{"id":"m","type":"user","type":"system","blocks":[],"createdAt":"' + at + '"}',
    '{"id":"m","type":"user","blocks":[{"id":"b","kind":"text","visibility":{"toHuman":true,"toModel":true,"to\\u004dodel":false},"text":"x"}],"createdAt":"' +
      at +
      '"}',
    '{"id":"m","type":"system_reminder","blocks":[],"createdAt":"' +
      at +
      '","nature":"event","source":{"kind":"extension","extension":"e","payload":{"a":1,"\\u0061":2}}}',
  ])
    it(`decoded duplicate any nesting ${body.slice(0, 55)}`, () =>
      expect(judgeMessageText(body)).toEqual({ rejected: 'malformed' }))
  it('record counters preserve a huge integer and huge positive exponent exactly', () => {
    for (const numeric of ['12345678901234567890', '1e400', '1.00000000000000000000']) {
      const source =
        '{"kind":"model_call_opened","call":"mc","dispatch":' +
        numeric +
        ',"firstTokenAt":"' +
        at +
        '"}'
      const result = judgeModelInvocationRecordText(source)
      expect('ok' in result).toBe(true)
      if ('ok' in result) expect(writeJsonLossless(result.ok)).toBe(source)
    }
    for (const numeric of ['1.00000000000000000001', '-0', '-1', '0.1', '1e-400'])
      expect(
        judgeModelInvocationRecordText(
          '{"kind":"model_call_opened","call":"mc","dispatch":' +
            numeric +
            ',"firstTokenAt":"' +
            at +
            '"}',
        ),
      ).toEqual({ rejected: 'malformed' })
  })
  it('attempt counters and embedded original attachment bytes receive exact integer checks', () => {
    expect(
      'ok' in
        judgeMessageText(
          '{"id":"m","type":"system_reminder","blocks":[],"createdAt":"' +
            at +
            '","nature":"event","source":{"kind":"attempt_started","attempt":1e400,"at":"' +
            at +
            '","reason":"first"}}',
        ),
    ).toBe(true)
    const message = {
      id: 'm',
      type: 'user',
      createdAt: at,
      blocks: [
        {
          id: 'b',
          kind: 'file',
          visibility: { toHuman: true, toModel: true },
          attachment: {
            storage: 's',
            key: 'k',
            mediaType: 'application/octet-stream',
            bytes: new LosslessNumber('9007199254740992.0000000000000001'),
          },
        },
      ],
    }
    expect(judgeMessage(message)).toEqual({ rejected: 'malformed' })
  })
  it('opaque thought content and extension missing/null payload survive lossless writing', () => {
    const m = judgeMessageText(
      '{"id":"m","type":"assistant","response":"r","ending":"complete","createdAt":"' +
        at +
        '","blocks":[{"id":"b","kind":"thinking","visibility":{"toHuman":false,"toModel":false},"text":"","opaque":{"n":12345678901234567890}}]}',
    )
    expect('ok' in m).toBe(true)
    if ('ok' in m && m.ok.type === 'assistant') {
      const thought = m.ok.blocks[0]
      if (thought?.kind !== 'thinking' || thought.opaque === undefined)
        throw new Error('missing opaque')
      expect(writeJsonLossless(readOpaqueJson(thought.opaque))).toBe('{"n":12345678901234567890}')
      expect('ok' in judgeMessage(m.ok)).toBe(true)
    }
    for (const payload of [{}, { payload: null }]) {
      const wire = {
        id: 'r',
        type: 'system_reminder',
        nature: 'state',
        blocks: [],
        createdAt: at,
        source: { kind: 'extension', extension: 'e', ...payload },
      }
      const judged = judgeMessage(wire)
      expect('ok' in judged).toBe(true)
      if ('ok' in judged) expect(writeJsonLossless(judged.ok)).toBe(writeJsonLossless(wire))
    }
  })
  it('non-JSON input is rejected without invoking getters, toJSON, or changing input', () => {
    let accessed = 0
    const bad = {
      id: 'm',
      type: 'user',
      createdAt: at,
      blocks: [],
      get extra() {
        accessed++
        return true
      },
    }
    expect(judgeMessage(bad)).toEqual({ rejected: 'malformed' })
    expect(accessed).toBe(0)
    for (const value of [NaN, Infinity, undefined, new Date(), { ...bad, extra: undefined }])
      expect(judgeMessage(value)).toEqual({ rejected: 'malformed' })
    const input = { id: 'm', type: 'user', createdAt: at, blocks: [text('b')] }
    const before = writeJsonLossless(input)
    const result = judgeMessage(input)
    expect('ok' in result).toBe(true)
    expect(writeJsonLossless(input)).toBe(before)
    if ('ok' in result) {
      expect(Object.isFrozen(result.ok)).toBe(true)
      expect(Object.isFrozen(result.ok.blocks)).toBe(true)
      expect(Object.isFrozen(result.ok.blocks[0])).toBe(true)
      const first = input.blocks[0]
      if (first === undefined) throw new Error('missing input fixture block')
      first.text = 'changed'
      expect(writeJsonLossless(result.ok)).toBe(before)
    }
  })
})
describe('S49 actual sent parameter reconstruction and exact cross-member comparisons', () => {
  it('accepts changing and dropping actual requested items without mutating them', () => {
    const input = {
      ...record,
      parameterAdjustments: [{ name: 'reasoningEffort', requested: 'max', sent: 'high' }],
      droppedParameters: ['top_k'],
    }
    const before = writeJsonLossless(input)
    expect('ok' in judgeModelInvocationRecord(input)).toBe(true)
    expect(writeJsonLossless(input)).toBe(before)
  })
  for (const extra of [
    { parameterAdjustments: [{ name: 'reasoningEffort', requested: 'high', sent: 'medium' }] },
    { parameterAdjustments: [{ name: 'reasoningEffort', requested: 'max', sent: 'max' }] },
    { parameterAdjustments: [{ name: 'missing', requested: 1, sent: 2 }] },
    {
      parameterAdjustments: [
        { name: 'reasoningEffort', requested: 'max', sent: 'high' },
        { name: 'reasoningEffort', requested: 'max', sent: 'medium' },
      ],
    },
    {
      parameterAdjustments: [{ name: 'reasoningEffort', requested: 'max', sent: 'high' }],
      droppedParameters: ['reasoningEffort'],
    },
    { droppedParameters: ['missing'] },
    { parameterAdjustments: [{ name: 'maxOutputTokens', requested: 50, sent: 0 }] },
    { droppedParameters: ['extra'] },
  ])
    it(`rejects invalid actual disposition ${writeJsonLossless(extra)}`, () => {
      const input = { ...record, ...extra }
      expect(validate('ModelInvocationRecord', input).valid).toBe(true)
      expect(judgeModelInvocationRecord(input)).toEqual({ rejected: 'malformed' })
    })
  it('compares number values exactly; distinct spelling equal decimal is not an adjustment', () => {
    const parameters = {
      ...record.parameters,
      extra: { amount: new LosslessNumber('12345678901234567890.0000000000000000001') },
    }
    const same = {
      ...record,
      parameters,
      parameterAdjustments: [
        {
          name: 'amount',
          requested: new LosslessNumber('12345678901234567890.00000000000000000010'),
          sent: new LosslessNumber('12345678901234567890.0000000000000000001'),
        },
      ],
    }
    expect(judgeModelInvocationRecord(same)).toEqual({ rejected: 'malformed' })
    const different = {
      ...same,
      parameterAdjustments: [
        {
          name: 'amount',
          requested: parameters.extra.amount,
          sent: new LosslessNumber('12345678901234567890.0000000000000000002'),
        },
      ],
    }
    expect('ok' in judgeModelInvocationRecord(different)).toBe(true)
  })
  it('arbitrary JSON requested equality ignores object member order but keeps arrays ordered', () => {
    const parameters = { ...record.parameters, extra: { entry: data('{"a":1.0,"b":[2,null]}') } }
    expect(
      'ok' in
        judgeModelInvocationRecord({
          ...record,
          parameters,
          parameterAdjustments: [
            { name: 'entry', requested: data('{"b":[2,null],"a":1}'), sent: { changed: true } },
          ],
        }),
    ).toBe(true)
    expect(
      judgeModelInvocationRecord({
        ...record,
        parameters,
        parameterAdjustments: [
          { name: 'entry', requested: data('{"b":[null,2],"a":1}'), sent: { changed: true } },
        ],
      }),
    ).toEqual({ rejected: 'malformed' })
  })
})
