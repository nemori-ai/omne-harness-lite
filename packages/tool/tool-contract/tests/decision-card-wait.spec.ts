import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { createSchemaProvider, validate } from '@omne-harness/schema-provider'
import { decisionCardAdoption, decisionCardWaitContract } from '../src/provider.ts'
import { isToolWaitContract } from '../src/wait-contract.ts'

const provider = createSchemaProvider({
  maxSnapshots: 8,
  maxConstructDepth: 16,
  maxConstructNodes: 512,
  failureBackoffMs: 0,
  maxAttempts: 1,
})
const limits = {
  maxBytes: 65536,
  maxDepth: 8,
  maxItems: 1024,
  maxMembers: 16,
  maxStringLength: 8192,
  maxNumberLength: 32,
}
const check = (ref: Parameters<typeof validate>[1], value: unknown) =>
  validate(provider, ref, readJsonText(JSON.stringify(value), limits)).then(result => result.kind)

const question = {
  cardId: 'q1',
  kind: 'question',
  title: 'Which port?',
  description: 'Pick one.',
  options: [
    { id: 'o1', label: '8081', description: 'Free.' },
    { id: 'o2', label: '3000', description: 'The default.' },
  ],
  declineConsequence: 'The question stays unanswered.',
}
const approval = {
  cardId: 'approval',
  kind: 'approval',
  title: 'Delete build/?',
  description: 'It holds stale artifacts.',
  options: [],
  declineConsequence: 'The directory stays.',
}

describe('the one wait contract for asking a person', () => {
  it('is an ask wait without expiry, owned by the Tool contract', () => {
    expect(isToolWaitContract(decisionCardWaitContract)).toBe(true)
    expect(decisionCardWaitContract.kind).toBe('ask')
    expect(decisionCardWaitContract.expiry).toBe('forbidden')
    expect(decisionCardWaitContract.adoption).toEqual(decisionCardAdoption)
    expect(decisionCardAdoption.owner).toBe('@omne-harness/tool-contract')
  })

  it('takes questions and approvals of any tool, and closes every object', async () => {
    const request = decisionCardWaitContract.request.ref
    expect(await check(request, { questions: [question, approval] })).toBe('valid')
    expect(await check(request, { questions: [] })).toBe('invalid')
    expect(await check(request, { questions: [question], tool: 'Approve' })).toBe('invalid')
    expect(await check(request, { questions: [{ ...question, x: 1 }] })).toBe('invalid')
    expect(await check(request, { questions: [{ ...question, kind: 'admission' }] })).toBe(
      'invalid',
    )
    expect(await check(request, { questions: [{ ...question, title: '' }] })).toBe('invalid')
    expect(await check(request, { questions: [{ ...question, description: '' }] })).toBe('invalid')
    expect(await check(request, { questions: [{ ...question, options: [] }] })).toBe('invalid')
  })

  it('answers one entry per card: a selection, words, or no answer', async () => {
    const response = decisionCardWaitContract.response.ref
    const answers = [
      { cardId: 'q1', kind: 'selection', optionId: 'o1' },
      { cardId: 'approval', kind: 'text', text: 'only the cache' },
      { cardId: 'q2', kind: 'no-answer' },
    ]
    expect(await check(response, { answers })).toBe('valid')
    expect(await check(response, { answers: [] })).toBe('invalid')
    expect(await check(response, { answers: [{ cardId: 'q1', kind: 'maybe' }] })).toBe('invalid')
    expect(await check(response, { answers, more: true })).toBe('invalid')
  })
})
