import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { DECISION_REQUEST_MAX_BYTES, hitlDecisionWait } from '@omne-harness/human-intervention-tool'
import type { McpPersonAsk, PersonAnswer } from '@omne-harness/mcp-bridge'

const DECLINE = '拒绝之后，对端收到「拒绝」，这次调用照对端的答复收场。'
const LIMITS = {
  maxBytes: DECISION_REQUEST_MAX_BYTES,
  maxDepth: 16,
  maxItems: 4096,
  maxMembers: 64,
  maxStringLength: DECISION_REQUEST_MAX_BYTES,
  maxNumberLength: 32,
}

function tree(value: unknown): JsonValue | undefined {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  return read.kind === 'ok' ? read.value : undefined
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function answerOf(given: Readonly<Record<string, unknown>>): PersonAnswer | undefined {
  if (given['kind'] === 'selection' && typeof given['optionId'] === 'string')
    return { kind: 'choice', id: given['optionId'] }
  if (given['kind'] === 'text' && typeof given['text'] === 'string')
    return { kind: 'text', text: given['text'] }
  return given['kind'] === 'no-answer' ? { kind: 'none' } : undefined
}

/** The questions of an MCP endpoint as cards of human intervention, and the person's decision read back per card. */
export const mcpPersonAsk: McpPersonAsk = {
  contract: hitlDecisionWait,
  request: questions =>
    tree({
      questions: questions.map(question => ({
        cardId: question.id,
        kind: 'question',
        title: question.title,
        description: question.description,
        options: question.choices.map(choice => ({ ...choice, description: choice.label })),
        declineConsequence: DECLINE,
      })),
    }),
  reply(decision) {
    if (decision.kind === 'declined') return { kind: 'declined' }
    if (decision.kind === 'no-answer') return { kind: 'no-answer' }
    const given = isRecord(decision.value) ? decision.value['answers'] : undefined
    if (!Array.isArray(given)) return undefined
    const answers = new Map<string, PersonAnswer>()
    for (const item of given) {
      if (!isRecord(item) || typeof item['cardId'] !== 'string') return undefined
      const answer = answerOf(item)
      if (answer === undefined) return undefined
      answers.set(item['cardId'], answer)
    }
    return { kind: 'answered', answers }
  },
}
