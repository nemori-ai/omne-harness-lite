import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import { createSchemaProvider, validate } from '@omne-harness/schema-provider'
import { DecisionRequestSchema, DecisionResponseSchema } from '@omne-harness/human-intervention'
import { hitlDecisionWait } from '../src/index.ts'

const provider = createSchemaProvider({
  maxSnapshots: 4,
  maxConstructDepth: 16,
  maxConstructNodes: 512,
  failureBackoffMs: 0,
  maxAttempts: 1,
})
const limits = {
  maxBytes: 1_048_576,
  maxDepth: 8,
  maxItems: 32_768,
  maxMembers: 16,
  maxStringLength: 8192,
  maxNumberLength: 32,
}
const judge = async (which: 'request' | 'response', value: unknown) =>
  (
    await validate(
      provider,
      hitlDecisionWait[which].ref,
      readJsonText(JSON.stringify(value), limits),
    )
  ).kind

const option = (id: string) => ({ id, label: `选 ${id}`, description: `选项 ${id}。` })
const card = (kind: string, extra: object = {}) => ({
  cardId: 'c1',
  kind,
  title: '怎么继续？',
  description: '请选择。',
  options: [option('a'), option('b')],
  declineConsequence: '跳过此题，不作答。',
  ...extra,
})

describe('the wait contract of a decision a tool waits for', () => {
  it('is an ask wait that never expires', () => {
    expect(hitlDecisionWait.kind).toBe('ask')
    expect(hitlDecisionWait.expiry).toBe('forbidden')
    expect(hitlDecisionWait.adoption.owner).toBe('@omne-harness/human-intervention-tool')
  })

  it.each([
    ['an inquiry card', { questions: [card('question')] }],
    ['an approval card', { questions: [card('approval')] }],
    ['an extension card', { questions: [card('extension')] }],
    [
      'an option with an effect',
      { questions: [card('approval', { options: [{ ...option('a'), effectRef: 'g' }] })] },
    ],
    ['an extra field', { questions: [card('question', { x: 1 })] }],
    ['no card', { questions: [] }],
  ])('judges %s the same in the JSON Schema and the decision schema', async (_name, value) => {
    const valid = DecisionRequestSchema.safeParse(value).success
    expect(await judge('request', value)).toBe(valid ? 'valid' : 'invalid')
  })

  it.each([
    [
      'three kinds',
      {
        answers: [
          { cardId: 'a', kind: 'selection', optionId: 'x' },
          { cardId: 'b', kind: 'text', text: 't' },
          { cardId: 'c', kind: 'no-answer' },
        ],
      },
    ],
    ['a decline', { answers: [{ cardId: 'a', kind: 'decline' }] }],
    ['an empty batch', { answers: [] }],
    ['an extra field', { answers: [{ cardId: 'a', kind: 'no-answer', x: 1 }] }],
  ])('judges the response %s the same in both', async (_name, value) => {
    const valid = DecisionResponseSchema.safeParse(value).success
    expect(await judge('response', value)).toBe(valid ? 'valid' : 'invalid')
  })

  it('names the request and the response by their own identities', () => {
    const { request, response } = hitlDecisionWait
    expect(request.identity.id).not.toBe(response.identity.id)
    for (const identity of [request.identity, response.identity])
      expect(identity.digest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('fits one request into one human-intervention command', () => {
    expect(hitlDecisionWait.request.maxBytes).toBeLessThan(262_144)
  })
})
