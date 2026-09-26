import { describe, expect, it } from 'vitest'
import { readJsonStrict, writeJsonLossless } from '@omne-harness-lite/content-blocks'
import {
  judgeMessage,
  judgeMessageInLog,
  judgeModelInvocationRecordText,
  judgePairing,
  validate,
  type SchemaDefName,
} from '@omne-harness-lite/messages'
import { at, assistant, logged, text, tool } from './helpers.ts'

const identifiers: readonly SchemaDefName[] = [
  'ResponseId',
  'CardId',
  'SessionRef',
  'AgentRef',
  'ScheduleRef',
  'RuntimeContextBlockId',
]
const idExamples = [
  { value: 'm_01', valid: true },
  { value: 'a b', valid: true },
  { value: '', valid: false },
  { value: ' m_01', valid: false },
  { value: 'm_01\n', valid: false },
  { value: '\uFEFFm_01', valid: false },
  { value: 42, valid: false },
]
describe('V1 repeated opaque identifier definitions', () => {
  for (const name of identifiers)
    for (const [index, example] of idExamples.entries())
      it(`${name} example ${index}`, () => {
        expect(validate(name, example.value).valid).toBe(example.valid)
      })
})

const visibility = { toHuman: true, toModel: true }
const blockViolations = [
  { reason: 'kind_unknown', block: { id: 'alien', kind: 'alien', visibility } },
  { reason: 'visibility_missing', block: { id: 'missing', kind: 'text', text: 'x' } },
  {
    reason: 'incomplete_call_visible',
    block: { id: 'half', kind: 'tool_call', complete: false, visibility, rawArguments: '{' },
  },
  {
    reason: 'call_in_result',
    block: {
      id: 'result',
      kind: 'tool_result',
      visibility,
      callId: 'call',
      outcome: 'completed',
      blocks: [
        {
          id: 'nested-call',
          kind: 'tool_call',
          visibility,
          complete: true,
          callId: 'nested',
          tool: 'invoke',
          arguments: {},
        },
      ],
    },
  },
  {
    reason: 'modality_mismatch',
    block: {
      id: 'image',
      kind: 'image',
      visibility,
      mediaType: 'audio/wav',
      data: { inline: 'eA==' },
    },
  },
]
describe('S39 block predicate priority across the entire message tree', () => {
  for (const [index, higher] of blockViolations.entries())
    for (const lower of blockViolations.slice(index + 1))
      for (const reverse of [false, true])
        it(`${higher.reason} beats ${lower.reason}, reversed=${reverse}`, () => {
          const blocks = reverse ? [lower.block, higher.block] : [higher.block, lower.block]
          const value = { id: 'm', type: 'user', createdAt: at, blocks }
          expect(judgeMessage(value)).toEqual({ rejected: higher.reason })
          expect(judgeMessageInLog(value, [])).toEqual({ rejected: higher.reason })
        })
  it('type_unknown precedes block predicates; missing type stays malformed', () => {
    expect(judgeMessage({ id: 'm', type: 'alien', blocks: [blockViolations[0]?.block] })).toEqual({
      rejected: 'type_unknown',
    })
    expect(judgeMessage({ id: 'm', blocks: [], createdAt: at })).toEqual({
      rejected: 'malformed',
    })
  })
  it('modality precedes duplicate ids, which precede the tool message block count', () => {
    const first = blockViolations[4]?.block
    if (first === undefined) throw new Error('missing modality fixture')
    expect(judgeMessage({ ...tool('call'), blocks: [first, text(first.id)] })).toEqual({
      rejected: 'modality_mismatch',
    })
    expect(judgeMessage({ ...tool('call'), blocks: [text('b'), text('b')] })).toEqual({
      rejected: 'block_id_duplicate',
    })
  })
  it('previous absence precedes malformed, which precedes forward references', () => {
    expect(
      judgeMessage({
        id: 'm',
        type: 'system_reminder',
        nature: 'state',
        source: { kind: 'runtime_context_changed', block: 'b', current: null },
        blocks: [],
        createdAt: at,
      }),
    ).toEqual({ rejected: 'reminder_state_without_previous' })
    expect(
      judgeMessageInLog(
        {
          id: 'c',
          type: 'compaction',
          blocks: [],
          silenced: [{ messageId: 'future', blockId: 'missing' }],
          createdAt: at,
          extra: true,
        },
        [],
      ),
    ).toEqual({ rejected: 'malformed' })
  })
})

describe('V13 record duplicate keys at all decoding depths', () => {
  const bodies = [
    '{"kind":"model_call_opened","call":"mc","call":"other","dispatch":1,"firstTokenAt":"' +
      at +
      '"}',
    '{"kind":"model_call_opened","call":"mc","dispatch":1,"dispa\\u0074ch":2,"firstTokenAt":"' +
      at +
      '"}',
    '{"kind":"model_selection_changed","routeName":"r","at":"' +
      at +
      '","previous":{"a":[{"x":1,"\\u0078":2}]}}',
  ]
  for (const [index, body] of bodies.entries())
    it(`record decoded duplicate ${index}`, () => {
      expect(judgeModelInvocationRecordText(body)).toEqual({ rejected: 'malformed' })
      expect(readJsonStrict(body)).toEqual({ failed: 'duplicate_member' })
    })
  it('a nested duplicate is rejected inside otherwise valid dispatch parameters', () => {
    const input = {
      kind: 'model_call_dispatched',
      call: 'mc',
      dispatch: 1,
      provider: 'p',
      response: 'r',
      profile: { origin: 'official', routeName: 'vendor/chat' },
      profileSnapshot: {
        providers: ['p'],
        allowFallback: true,
        inputModalities: ['text'],
        outputModalities: ['text'],
        maxInputTokens: 100,
        maxOutputTokens: 50,
        updatedAt: at,
      },
      parameters: { extra: { nested: { a: 1 } } },
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
    }
    const body = writeJsonLossless(input)
    expect('ok' in judgeModelInvocationRecordText(body)).toBe(true)
    const duplicate = body.replace('"a":1', '"a":1,"\\u0061":2')
    expect(judgeModelInvocationRecordText(duplicate)).toEqual({ rejected: 'malformed' })
  })
})

describe('S31 pairing of a complete unparseable call', () => {
  it('recognizes a complete raw call while leaving execution and eventual presence to its owner', () => {
    const source = assistant('call')
    const calling = logged({
      ...source,
      blocks: [
        {
          id: 'raw-call',
          kind: 'tool_call',
          complete: true,
          visibility,
          tool: 'invoke',
          callId: 'call',
          unparseable: true,
          rawArguments: '{',
        },
      ],
    })
    const failed = logged(tool('call', 'failed'))
    expect(judgePairing(failed, [calling])).toEqual({ valid: true })
    expect(judgePairing(calling, [])).toEqual({ valid: true })
    expect(judgePairing(logged(tool('call', 'failed', 'duplicate')), [calling, failed])).toEqual({
      valid: false,
      rule: 2,
    })
  })
})
