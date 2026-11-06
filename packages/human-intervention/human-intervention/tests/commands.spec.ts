import { describe, expect, it } from 'vitest'
import {
  HITL_COMMAND_MAX_BYTES,
  HitlIdentifierSchema,
  OriginSchema,
  QuestionSchema,
  RegisterRequestSchema,
  decodeHitlCommand,
} from '../src/index.ts'

const operation = { tenantRef: 'tenant-a', actorRef: 'human-a', operationId: 'operation-a' }
const wait = {
  owner: 'independent-app',
  waitId: 'wait-a',
  incarnation: 'logical-1',
  destination: 'inbox-a',
}
const origin = {
  kind: 'independent',
  originRef: 'origin-a',
  wait,
  positionRef: 'step-a',
  adoptionRef: 'implementation-a',
}
const option = { id: 'yes', label: '继续', description: '继续下一步。' }
const question = {
  cardId: 'card-a',
  title: '你的想法？',
  description: '可以选择或直接填写。',
  kind: 'question',
  options: [option],
}
const reply = {
  protocol: 'hitl/1',
  operation,
  cardRef: { request: { tenantRef: 'tenant-a', requestId: 'request-a' }, cardId: 'card-a' },
  expectedRevision: '0',
  reply: { kind: 'text', text: ' 原话\n' },
}

describe('bounded JSON command boundary', () => {
  it('decodes a valid original-text reply without normalizing it', () => {
    const result = decodeHitlCommand('submitReply', JSON.stringify(reply))
    expect(result).toMatchObject({ kind: 'decoded', command: reply })
  })
  it.each([
    { ...reply, extra: true },
    { ...reply, expectedRevision: '01' },
    { ...reply, expectedRevision: -1 },
    { ...reply, reply: { kind: 'text', text: '' } },
    { ...reply, reply: { kind: 'selection', optionId: 'yes', text: 'also text' } },
    { ...reply, reply: { kind: 'timeout' } },
    { ...reply, operation: { ...operation, principal: 'admin' } },
  ])('rejects fields and variants outside hitl/1: %j', input => {
    expect(decodeHitlCommand('submitReply', JSON.stringify(input))).toEqual({
      kind: 'invalid-input',
      reason: 'shape',
    })
  })
  it('rejects invalid JSON and counts the byte budget before parsing', () => {
    expect(decodeHitlCommand('submitReply', '{')).toEqual({ kind: 'invalid-input', reason: 'json' })
    const text = '汉'.repeat(Math.ceil(HITL_COMMAND_MAX_BYTES / 3))
    expect(text.length).toBeLessThan(HITL_COMMAND_MAX_BYTES)
    expect(decodeHitlCommand('submitReply', text)).toEqual({
      kind: 'limited',
      resource: 'command-bytes',
      limit: HITL_COMMAND_MAX_BYTES,
    })
  })
  it('counts Unicode code points rather than UTF-16 halves for identifiers', () => {
    expect(HitlIdentifierSchema.safeParse('🕑'.repeat(256)).success).toBe(true)
    expect(HitlIdentifierSchema.safeParse('🕑'.repeat(257)).success).toBe(false)
  })
  it('enforces code point limits even when ASCII text fits the byte budget', () => {
    expect(HitlIdentifierSchema.safeParse('a'.repeat(256)).success).toBe(true)
    expect(HitlIdentifierSchema.safeParse('a'.repeat(257)).success).toBe(false)
    const atLimit = { ...reply, reply: { kind: 'text', text: 'a'.repeat(8192) } }
    expect(decodeHitlCommand('submitReply', JSON.stringify(atLimit))).toMatchObject({
      kind: 'decoded',
      command: atLimit,
    })
    const overLimit = { ...reply, reply: { kind: 'text', text: 'a'.repeat(8193) } }
    expect(decodeHitlCommand('submitReply', JSON.stringify(overLimit))).toEqual({
      kind: 'invalid-input',
      reason: 'shape',
    })
  })
})

describe('request source and question contracts', () => {
  it('supports an independent source with no session', () => {
    expect(
      RegisterRequestSchema.safeParse({
        protocol: 'hitl/1',
        operation,
        origin,
        questions: [question],
        displayContext: '独立应用正在等你的答复。',
        preparationRef: 'prepared-a',
      }).success,
    ).toBe(true)
  })
  it('requires the tool call identity and the session of a run', () => {
    expect(OriginSchema.safeParse({ ...origin, kind: 'tool' }).success).toBe(false)
    expect(OriginSchema.safeParse({ ...origin, kind: 'tool', toolCallRef: 'tool-a' }).success).toBe(
      true,
    )
    expect(OriginSchema.safeParse({ ...origin, runRef: 'run-a' }).success).toBe(false)
    expect(
      OriginSchema.safeParse({ ...origin, runRef: 'run-a', sessionRef: 'session-a' }).success,
    ).toBe(true)
  })
  it('reserves effect references for approval and admission', () => {
    const options = [{ ...option, effectRef: 'authorization-choice' }]
    expect(QuestionSchema.safeParse({ ...question, options }).success).toBe(false)
    expect(QuestionSchema.safeParse({ ...question, kind: 'extension', options }).success).toBe(
      false,
    )
    expect(QuestionSchema.safeParse({ ...question, kind: 'approval', options }).success).toBe(true)
    expect(QuestionSchema.safeParse({ ...question, kind: 'admission', options }).success).toBe(true)
  })
  it('requires candidates for a question, unique options and unique cards', () => {
    expect(QuestionSchema.safeParse({ ...question, options: [] }).success).toBe(false)
    expect(QuestionSchema.safeParse({ ...question, options: [option, option] }).success).toBe(false)
    expect(
      RegisterRequestSchema.safeParse({
        protocol: 'hitl/1',
        operation,
        origin,
        questions: [question, question],
        displayContext: '重复卡片',
        preparationRef: 'prepared-a',
      }).success,
    ).toBe(false)
  })
})

it.each(['\ud800', '\udfff', 'before\ud800after'])(
  'rejects malformed Unicode at the public schema and decoder: %j',
  text => {
    expect(HitlIdentifierSchema.safeParse(text).success).toBe(false)
    expect(
      decodeHitlCommand('submitReply', JSON.stringify({ ...reply, reply: { kind: 'text', text } })),
    ).toEqual({ kind: 'invalid-input', reason: 'shape' })
  },
)

it('keeps NUL, controls, spaces and valid surrogate pairs in the public text domain', () => {
  const text = '\0\u0001\t\n \ud83d\ude00'
  expect(HitlIdentifierSchema.parse(text)).toBe(text)
  expect(
    decodeHitlCommand('submitReply', JSON.stringify({ ...reply, reply: { kind: 'text', text } })),
  ).toMatchObject({ kind: 'decoded', command: { reply: { kind: 'text', text } } })
})
