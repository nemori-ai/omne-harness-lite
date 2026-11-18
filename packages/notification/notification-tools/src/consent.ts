import { createHash } from 'node:crypto'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { SubscriptionChange } from '@omne-harness/notification-contract'
import { z } from 'zod'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolDecision } from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import type { AgentRecipient } from './port.ts'
import { subscribeParamsSchema, type ArgumentsOf } from './protocol.ts'

/** What the call keeps across the wait: the subscribe it was asked, the content the owner sees, and the card raised. */
export type ConsentState = Readonly<{
  params: ArgumentsOf<'subscribe'>['params']
  content: string
  cardId: string
}>

/** A subscribe whose note and scope are so long that the kept state is over this is refused. */
export const CONSENT_STATE_MAX_BYTES = 8192
export const consentStateIdentity = {
  id: '@omne-harness/notification-tools/consent-state',
  revision: '1',
  digest: describedAdoption({
    owner: '@omne-harness/notification-tools',
    name: 'consent-state',
    revision: '1',
    shape: 'params, content, cardId',
  }).digest,
}
export const consentStateCodec = describedAdoption({
  owner: '@omne-harness/notification-tools',
  name: 'consent-state-json',
  revision: '1',
  changes: 'The consent state as UTF-8 JSON text.',
})

export const CONSENT_OPTIONS = {
  approve: { label: '同意', description: '这个 agent 之后会收到这类通知。' },
  reject: { label: '不同意', description: '不建这条订阅，原来的设置不变。' },
} as const

export const cardIdOf = (content: string) =>
  `notification-consent-${createHash('sha256').update(content).digest('hex')}`

const LEVELS = { off: '不收', weak: '弱提醒', strong: '强提醒' } as const

function scopeText(scope: SubscriptionChange['scope']): string {
  if (scope.kind === 'all') return '全部'
  return scope.kind === 'subject' ? `对象是「${scope.equals}」` : `对象以「${scope.prefix}」开头`
}

function termText(term: SubscriptionChange['term']): string {
  if (term.kind === 'standing') return '一直有效'
  return term.kind === 'once' ? '只收下一条' : `到 ${term.at} 为止`
}

/** The inquiry card: which notifications the agent wants, at which level, and for how long. */
export function consentCard(
  input: Readonly<{
    self: AgentRecipient
    change: SubscriptionChange
    content: string
    label: string
  }>,
) {
  const { change, label } = input
  const lines = [
    `agent「${input.self.ref}」想订阅通知，需要你确认。`,
    `通知：${label}（${change.source} / ${change.type}）`,
    `范围：${scopeText(change.scope)}；级别：${LEVELS[change.level]}；期限：${termText(change.term)}`,
    change.note === null ? null : `它写的备注：${change.note}`,
  ].filter((line): line is string => line !== null)
  return {
    cardId: cardIdOf(input.content),
    kind: 'question' as const,
    title: `agent 想订阅「${label}」`.slice(0, 256),
    description: lines.join('\n').slice(0, 4096),
    options: Object.entries(CONSENT_OPTIONS).map(([id, option]) => ({ id, ...option })),
    declineConsequence: '不建这条订阅，原来的设置不变。',
  }
}

const encoder = new TextEncoder()

/** The state as the bytes the call keeps. One that would not fit the declared limit is refused, not cut. */
export function encodeConsentState(state: ConsentState): Outcome<Uint8Array, string> {
  const bytes = encoder.encode(JSON.stringify(state))
  return bytes.byteLength > CONSENT_STATE_MAX_BYTES
    ? fail('consent-state-too-large')
    : succeed(bytes)
}

const stateSchema = z.strictObject({
  params: subscribeParamsSchema,
  content: z.string(),
  cardId: z.string(),
})

/** A kept state is readable when it is whole and its card is the card of its content. */
export function readConsentState(bytes: Uint8Array): Outcome<ConsentState, string> {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return fail('consent-state-unreadable')
  }
  const parsed = stateSchema.safeParse(value)
  return parsed.success && parsed.data.cardId === cardIdOf(parsed.data.content)
    ? succeed(parsed.data)
    : fail('consent-state-unreadable')
}

export type OwnerAnswer =
  | Readonly<{ kind: 'approved' }>
  | Readonly<{ kind: 'declined' }>
  | Readonly<{ kind: 'replied'; text: string }>
  | Readonly<{ kind: 'skipped' }>

/** What the owner's answer on this call's card means. An answer to another card is no answer. */
export function ownerAnswerOf(state: ConsentState, decision: ToolDecision<unknown>): OwnerAnswer {
  if (decision.kind !== 'answer') return { kind: 'skipped' }
  const answers = Reflect.get(Object(decision.value), 'answers')
  const answer: unknown = Array.isArray(answers)
    ? answers.find(item => Reflect.get(Object(item), 'cardId') === state.cardId)
    : undefined
  const kind = Reflect.get(Object(answer), 'kind')
  if (kind === 'text') return { kind: 'replied', text: String(Reflect.get(Object(answer), 'text')) }
  if (kind !== 'selection') return { kind: 'skipped' }
  return Reflect.get(Object(answer), 'optionId') === 'approve'
    ? { kind: 'approved' }
    : { kind: 'declined' }
}

export function requestTree(card: ReturnType<typeof consentCard>): JsonValue {
  const read = readJsonText(JSON.stringify({ questions: [card] }), {
    maxBytes: 65_536,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 8192,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new TypeError('the consent card is not bounded JSON')
  return read.value
}
