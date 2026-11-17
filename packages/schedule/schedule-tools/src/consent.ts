import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolDecision } from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import type { WriteArguments } from './calls.ts'
import { schedulesCommandNames } from './protocol.ts'

/** What the call keeps across the wait: the original write, the content digest, and the card raised. */
export type ConsentState = Readonly<{ args: WriteArguments; digest: string; cardId: string }>

export const CONSENT_STATE_MAX_BYTES = 131_072
export const consentStateIdentity = {
  id: '@omne-harness/schedule-tools/consent-state',
  revision: '1',
  digest: describedAdoption({
    owner: '@omne-harness/schedule-tools',
    name: 'consent-state',
    revision: '1',
    shape: 'args, digest, cardId',
  }).digest,
}
export const consentStateCodec = describedAdoption({
  owner: '@omne-harness/schedule-tools',
  name: 'consent-state-json',
  revision: '1',
  changes: 'The consent state as UTF-8 JSON text.',
})

export const CREATE_OPTIONS = {
  activate: { label: '启用', description: '日程现在生效。' },
  draft: { label: '先存草稿', description: '先存成草稿，之后你再决定要不要启用。' },
  none: { label: '不建', description: '不建这条日程。' },
} as const
export const CHANGE_OPTIONS = {
  approve: { label: '同意', description: '照这次改动执行。' },
  reject: { label: '不同意', description: '不做这次改动，日程保持原样。' },
} as const

const ACTION: Readonly<Record<WriteArguments['command'], string>> = {
  create: '新建',
  update: '修改',
  revise: '修改草稿',
  replace: '替换规则',
  promote: '启用',
  pause: '暂停',
  resume: '恢复',
  stop: '停止',
  discard: '丢弃',
}

export const cardIdOf = (digest: string) => `schedule-consent-${digest}`

/** The inquiry card: what the agent wants to do, to which schedule, and what happens next. */
export function consentCard(
  input: Readonly<{
    args: WriteArguments
    digest: string
    label: string
    upcoming: readonly string[]
    session: string | null
  }>,
) {
  const { args } = input
  const options = args.command === 'create' ? CREATE_OPTIONS : CHANGE_OPTIONS
  const lines = [
    `agent 想${ACTION[args.command]}日程「${input.label}」，需要你确认。`,
    input.upcoming.length === 0 ? null : `接下来几次：${input.upcoming.join('；')}`,
    input.session === null ? null : `来自会话 ${input.session}。`,
  ].filter((line): line is string => line !== null)
  return {
    cardId: cardIdOf(input.digest),
    kind: 'question' as const,
    title: `agent 想${ACTION[args.command]}日程「${input.label}」`.slice(0, 256),
    description: lines.join('\n').slice(0, 4096),
    options: Object.entries(options).map(([id, option]) => ({ id, ...option })),
    declineConsequence: '不做这次改动，日程保持原样。',
  }
}

const decoder = new TextDecoder('utf-8', { fatal: true })

export function readConsentState(bytes: Uint8Array): Outcome<ConsentState, string> {
  let value: unknown
  try {
    value = JSON.parse(decoder.decode(bytes))
  } catch {
    return fail('consent-state-unreadable')
  }
  if (typeof value !== 'object' || value === null) return fail('consent-state-unreadable')
  const { args, digest, cardId } = value as Record<string, unknown>
  const command = typeof args === 'object' && args !== null ? Reflect.get(args, 'command') : null
  if (
    typeof digest !== 'string' ||
    typeof cardId !== 'string' ||
    cardId !== cardIdOf(digest) ||
    !schedulesCommandNames.some(name => name === command)
  )
    return fail('consent-state-unreadable')
  return succeed(value as ConsentState)
}

export type OwnerAnswer =
  | Readonly<{ kind: 'confirm' }>
  | Readonly<{ kind: 'draft' }>
  | Readonly<{ kind: 'declined' }>
  | Readonly<{ kind: 'replied'; text: string }>
  | Readonly<{ kind: 'skipped' }>

/** What the owner's answer on this call's card means; an answer to another card is no answer. */
export function ownerAnswerOf(state: ConsentState, decision: ToolDecision<unknown>): OwnerAnswer {
  if (decision.kind !== 'answer') return { kind: 'skipped' }
  const answers = Reflect.get(Object(decision.value), 'answers')
  const answer: unknown = Array.isArray(answers)
    ? answers.find(item => Reflect.get(Object(item), 'cardId') === state.cardId)
    : undefined
  const kind = Reflect.get(Object(answer), 'kind')
  if (kind === 'text') return { kind: 'replied', text: String(Reflect.get(Object(answer), 'text')) }
  if (kind !== 'selection') return { kind: 'skipped' }
  const option = Reflect.get(Object(answer), 'optionId')
  if (option === 'activate' || option === 'approve') return { kind: 'confirm' }
  if (option === 'draft' && state.args.command === 'create') return { kind: 'draft' }
  return { kind: 'declined' }
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
