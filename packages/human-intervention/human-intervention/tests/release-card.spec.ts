import { describe, expect, it } from 'vitest'
import { CardSchema, QuestionSchema, SubmitReplySchema, decideReply } from '../src/index.ts'

const cardRef = { request: { tenantRef: 'tenant-a', requestId: 'request-a' }, cardId: 'card-a' }
const release = {
  cardId: 'card-a',
  kind: 'release',
  title: '要执行 Shell run，放行吗？',
  description: '要执行 Shell run，放行吗？',
  declineConsequence: '这一次调用不执行。',
  target: { tool: 'Shell', command: 'run', preview: 'ls -la' },
  arguments: {
    text: '{"command":"run","params":{"cmd":"ls -la"}}',
    truncated: false,
    digest: 'd1',
  },
  origin: { session: 'ses_a', agent: 'exe_a' },
  gateTitle: '执行',
  options: [
    {
      id: 'deny-once',
      label: '本次不放行',
      description: '这一次调用不执行',
      offered: true,
      lasting: false,
    },
    {
      id: 'allow-once',
      label: '本次放行',
      description: '只执行这一次调用',
      offered: false,
      lasting: false,
    },
  ],
}

describe('the release card is its own kind of card', () => {
  it('takes the target, the arguments, the origin and options that carry their scope', () => {
    expect(QuestionSchema.safeParse(release).success).toBe(true)
  })

  it.each([
    ['no target', { target: undefined }],
    ['arguments over the bound', { arguments: { ...release.arguments, text: 'x'.repeat(4097) } }],
    [
      'an option with no offer',
      { options: [{ id: 'deny-once', label: '本次不放行', description: '这一次调用不执行' }] },
    ],
    ['no option', { options: [] }],
  ])('refuses a release card with %s before it is registered', (_name, change) => {
    expect(QuestionSchema.safeParse({ ...release, ...change }).success).toBe(false)
  })

  it('takes the gate its lasting options are about, whole or not at all', () => {
    const gate = { capabilityId: 'tool/Shell', enforcementKey: 'tool.invoke', basis: 'r7' }
    expect(QuestionSchema.safeParse({ ...release, gate }).success).toBe(true)
    const partial = { capabilityId: 'tool/Shell', enforcementKey: 'tool.invoke' }
    expect(QuestionSchema.safeParse({ ...release, gate: partial }).success).toBe(false)
  })

  it('takes a call with no command and no preview', () => {
    const target = { tool: 'read_file', command: null, preview: '' }
    expect(QuestionSchema.safeParse({ ...release, target }).success).toBe(true)
  })
})

describe('what the tool said the call would do, kept on the release card', () => {
  const rows = [
    { label: '收件人', value: '你' },
    { label: '标签', value: ['a', 'b'] },
  ]
  const typed = { kind: 'test.release@1', value: '{"title":"T"}' }
  const takes = (detail: unknown) => QuestionSchema.safeParse({ ...release, detail }).success

  it('takes rows with or without a typed value, and a detail the tool could not give', () => {
    expect(takes({ state: 'given', rows })).toBe(true)
    expect(takes({ state: 'given', rows, typed })).toBe(true)
    expect(takes({ state: 'unavailable' })).toBe(true)
  })

  it.each([
    ['no rows', { state: 'given', rows: [] }],
    ['too many rows', { state: 'given', rows: Array.from({ length: 25 }, () => rows[0]) }],
    ['a label over its bound', { state: 'given', rows: [{ label: 'l'.repeat(41), value: 'v' }] }],
    ['a text over its bound', { state: 'given', rows: [{ label: 'l', value: 'v'.repeat(501) }] }],
    ['an empty list', { state: 'given', rows: [{ label: 'l', value: [] }] }],
    [
      'too many items',
      { state: 'given', rows: [{ label: 'l', value: Array.from({ length: 13 }, () => 'i') }] },
    ],
    [
      'an item over its bound',
      { state: 'given', rows: [{ label: 'l', value: ['i'.repeat(201)] }] },
    ],
    [
      'a typed value over 16 KiB',
      { state: 'given', rows, typed: { kind: 'k@1', value: 'x'.repeat(16 * 1024 + 1) } },
    ],
    ['rows with a detail it could not give', { state: 'unavailable', rows }],
    ['an unknown state', { state: 'partial', rows }],
  ])('refuses a detail with %s', (_name, detail) => {
    expect(takes(detail)).toBe(false)
  })

  it('refuses a detail larger than the card keeps, whatever its parts', () => {
    const wide = Array.from({ length: 12 }, () => '字'.repeat(200))
    const full = Array.from({ length: 24 }, () => ({ label: '标'.repeat(40), value: wide }))
    expect(takes({ state: 'given', rows: full })).toBe(true)
    const control = Array.from({ length: 12 }, () => '\u0001'.repeat(200))
    const escaped = Array.from({ length: 24 }, () => ({ label: '标'.repeat(40), value: control }))
    expect(takes({ state: 'given', rows: escaped })).toBe(false)
  })
})

describe('an answer to a release card', () => {
  const card = CardSchema.parse({ kind: 'pending', ref: cardRef, revision: '0', question: release })
  const answer = (optionId: string) =>
    decideReply({
      card,
      command: SubmitReplySchema.parse({
        protocol: 'hitl/1',
        operation: { tenantRef: 'tenant-a', actorRef: 'human-a', operationId: 'answer-a' },
        cardRef,
        expectedRevision: '0',
        reply: { kind: 'selection', optionId },
      }),
      wait: 'live',
    })

  it('takes an option the card offers', () => {
    expect(answer('deny-once')).toMatchObject({ kind: 'ready' })
  })

  it('cannot choose an option the card shows but does not offer', () => {
    expect(answer('allow-once')).toEqual({ kind: 'invalid-input', reason: 'unknown-option' })
  })
})
