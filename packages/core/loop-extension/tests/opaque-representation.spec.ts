import { describe, expect, it } from 'vitest'
import {
  readJsonStrict,
  readOpaqueJson,
  writeJsonLossless,
  type ContentBlock,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { brandMessage, judgeMessage } from '@omne-harness-lite/messages'
import {
  judgeConclusion,
  judgeInput,
  judgeOutput,
  judgeValue,
  type ExtensionInput,
  type ExtensionOutput,
  type Subject,
} from '../src/v3/index.ts'
import { at, assistant, inputAt, recordAt, reminder, variants, visibility } from './helpers.ts'

const encoded = '{"token":"x","precision":9007199254740993,"small":1.2300,"nil":null}'
function payload(): JsonValue {
  const read = readJsonStrict(encoded)
  if ('failed' in read) throw new Error('fixture syntax')
  return read.ok
}
function thinking(): JsonObject {
  return { id: 'thought', kind: 'thinking', text: '', opaque: payload(), visibility }
}
function reply(): JsonObject {
  return { ...assistant, blocks: [thinking()] }
}
function nested(): JsonObject {
  return {
    id: 'result',
    kind: 'tool_result',
    callId: 'call_01',
    outcome: 'completed',
    visibility,
    blocks: [thinking()],
  }
}
function injected(): JsonObject {
  return { ...reminder, blocks: [{ id: 'note', kind: 'text', text: 'note', visibility }] }
}
function opaque(block: ContentBlock | undefined): string {
  if (block?.kind !== 'thinking' || block.opaque === undefined) throw new Error('missing opaque')
  return writeJsonLossless(readOpaqueJson(block.opaque))
}
function subjectOpaque(subject: Subject): string {
  if ('message' in subject) return opaque(subject.message.blocks[0])
  if ('request' in subject) return opaque(subject.request.messages[0]?.blocks[0])
  if ('reply' in subject) return opaque(subject.reply.blocks[0])
  if ('result' in subject) return opaque(subject.result?.blocks[0])
  throw new Error('subject has no normative opaque path')
}
function outputOpaque(output: ExtensionOutput): string {
  if (output.kind === 'rewrite') return subjectOpaque(output.subject)
  throw new Error('output has no normative opaque path')
}
function admitted(value: unknown): ExtensionInput {
  const result = judgeInput(value)
  if ('rejected' in result) throw new Error(`fixture input ${result.rejected}`)
  return result.ok
}
const locations = [
  { index: 1, subject: { producer: 'model', message: reply() } },
  { index: 2, subject: { message: reply() } },
  {
    index: 5,
    subject: {
      request: { target: 'vendor-a/chat-large', parameters: {}, messages: [reply()], tools: [] },
    },
  },
  { index: 6, subject: { ...variants[6]?.subject, reply: reply() } },
  { index: 9, subject: { callId: 'call_01', outcome: 'completed', result: nested() } },
] satisfies readonly { index: number; subject: JsonObject }[]

describe('LE-OPAQUE typed boundary inventory', () => {
  for (const { index, subject } of locations) {
    const variant = variants[index]
    if (variant === undefined) throw new Error('missing position')
    it(`LE-OPAQUE-INPUT-${index}: raw and branded subject values retain exact opaque data`, () => {
      const wire = { ...inputAt(variant), subject }
      const first = admitted(wire)
      expect(subjectOpaque(first.subject)).toBe(encoded)
      expect(subjectOpaque(admitted(first).subject)).toBe(encoded)
      expect(readJsonStrict(writeJsonLossless(first))).toEqual(
        readJsonStrict(writeJsonLossless(wire)),
      )
    })
    it(`LE-OPAQUE-OUTPUT-${index}: standalone rewrite Subject restores its domain values`, () => {
      const result = judgeOutput({ kind: 'rewrite', subject })
      if ('rejected' in result) throw new Error(`fixture output ${result.rejected}`)
      expect(outputOpaque(result.ok)).toBe(encoded)
    })
    if ([1, 5, 9].includes(index)) {
      it(`LE-OPAQUE-CONCLUSION-${index}: final comparison then reconstruction keeps opaque wrappers`, () => {
        const input = admitted({ ...inputAt(variant), subject })
        const record = recordAt(variant, 'rewrite', { kind: 'rewrite', subject })
        const result = judgeConclusion(record, { input, extensionName: 'g' })
        if ('rejected' in result || result.ok.output === undefined)
          throw new Error('fixture record')
        expect(outputOpaque(result.ok.output)).toBe(encoded)
      })
    }
  }
  it('LE-OPAQUE-EARLIER: earlier rewrite restores its payload beside a legitimate inject', () => {
    const variant = variants[1]
    if (variant === undefined) throw new Error('fixture position')
    const prior = [
      recordAt(variant, 'rewrite', {
        kind: 'rewrite',
        subject: { producer: 'model', message: reply() },
      }),
      recordAt(variant, 'rewrite', { kind: 'inject', message: injected() }),
    ]
    const input = admitted({ ...inputAt(variant), earlier: prior })
    for (const record of input.earlier) {
      if (record.output === undefined) throw new Error('missing earlier output')
      if (record.output.kind === 'rewrite') expect(outputOpaque(record.output)).toBe(encoded)
      else expect(record.output).toHaveProperty('message.blocks.0.text', 'note')
    }
  })
  it('LE-OPAQUE-INJECT: legitimate inject restores Message; nested result remains forbidden', () => {
    const output = { kind: 'inject', message: injected() }
    const judged = judgeOutput(output)
    if ('rejected' in judged) throw new Error('fixture inject')
    expect(judged.ok).toHaveProperty('message.blocks.0.text', 'note')
    expect(judgeOutput({ kind: 'inject', message: { ...reminder, blocks: [nested()] } })).toEqual({
      rejected: 'malformed',
    })
    const variant = variants[0]
    if (variant === undefined) throw new Error('fixture position')
    const concluded = judgeConclusion(recordAt(variant, 'rewrite', output), {
      input: admitted(inputAt(variant)),
      extensionName: 'g',
    })
    if ('rejected' in concluded || concluded.ok.output === undefined)
      throw new Error('fixture conclusion')
    expect(concluded.ok.output).toHaveProperty('message.blocks.0.text', 'note')
  })
  it('LE-OPAQUE-SHAPE: Schema-admitted embedded messages retain prior successes', () => {
    const media = {
      ...assistant,
      blocks: [
        {
          id: 'b',
          kind: 'voice',
          mediaType: 'audio/wav',
          data: { storage: 's', key: 'k', mediaType: 'audio/ogg' },
          visibility,
        },
      ],
    }
    const duplicate = { ...assistant, blocks: [thinking(), thinking()] }
    expect(judgeMessage(media)).toEqual({ rejected: 'malformed' })
    expect(judgeMessage(duplicate)).toEqual({ rejected: 'block_id_duplicate' })
    for (const message of [media, duplicate, brandMessage(duplicate)]) {
      const input = admitted({
        position: 'before_persist_message',
        subject: { producer: 'model', message },
        earlier: [],
        log: 'l',
        environment: 'e',
      })
      expect(readJsonStrict(writeJsonLossless(input.subject))).toEqual(
        readJsonStrict(writeJsonLossless({ producer: 'model', message })),
      )
    }
  })
  it('LE-OPAQUE-OWNER: constructed domain values freeze copies without freezing callers', () => {
    const block = thinking()
    const message = { ...assistant, blocks: [block] }
    const subject = { producer: 'model', message }
    const input = admitted({
      position: 'before_persist_message',
      subject,
      earlier: [],
      log: 'l',
      environment: 'e',
    })
    expect(Object.isFrozen(message)).toBe(false)
    expect(Object.isFrozen(message.blocks)).toBe(false)
    expect(Object.isFrozen(subject)).toBe(false)
    expect(Object.isFrozen(block)).toBe(false)
    expect(Object.isFrozen(input)).toBe(true)
    expect(Object.isFrozen(input.subject)).toBe(true)
    expect(Object.isFrozen(input.earlier)).toBe(true)
    expect(Reflect.set(block, 'text', 'changed')).toBe(true)
    expect(subjectOpaque(input.subject)).toBe(encoded)
    if (!('message' in input.subject)) throw new Error('missing message')
    expect(input.subject.message.blocks[0]).toHaveProperty('text', '')
  })
  it('LE-OPAQUE-NEUTRAL: arbitrary keys outside normative locations remain ordinary JSON', () => {
    const variant = variants[3]
    if (variant === undefined) throw new Error('fixture position')
    const input = admitted({
      ...inputAt(variant),
      subject: { plan: { opaque: payload(), nested: { opaque: null } } },
    })
    if (!('plan' in input.subject)) throw new Error('missing plan')
    expect(writeJsonLossless(input.subject.plan)).toBe(
      `{"opaque":${encoded},"nested":{"opaque":null}}`,
    )
    expect(judgeValue('CompactionPlan', input.subject.plan)).toHaveProperty('ok')
  })
  it('LE-OPAQUE-PRESENCE: missing payload is absent and null is a real wrapped payload', () => {
    const { opaque: omitted, ...base } = thinking()
    expect(omitted).toBeDefined()
    for (const [block, expected] of [
      [base, undefined],
      [{ ...base, opaque: null }, 'null'],
    ] as const) {
      const input = admitted({
        position: 'before_persist_message',
        subject: { producer: 'model', message: { ...assistant, blocks: [block] } },
        earlier: [],
        log: 'l',
        environment: 'e',
      })
      if (!('message' in input.subject)) throw new Error('missing message')
      const restored = input.subject.message.blocks[0]
      expect(Object.hasOwn(restored ?? {}, 'opaque')).toBe(expected !== undefined)
      if (expected !== undefined) expect(opaque(restored)).toBe(expected)
    }
  })
})
