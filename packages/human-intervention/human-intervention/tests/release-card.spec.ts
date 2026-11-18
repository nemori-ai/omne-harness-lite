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
