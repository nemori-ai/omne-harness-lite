// Agent 的卡片端口（`DecisionCards`）到 HITL 的纯映射：一轮卡片的键、草稿到 HITL 卡片、卡片依据的
// 编解码、卡片状态到端口答复。这里不读写任何东西；调用 HITL 应用的部分在提供者里。
//
// 一轮卡片登记成一个 HITL 请求，每个卡片请求一张卡。键只由 passage 与 round 派生，所以同一轮的重送、
// 回查、读卡与作废都落在同一个 HITL 等待与同一组操作身份上。
import { createHash } from 'node:crypto'
import {
  admissionActionOf,
  cardDraftOf,
  type CardReply,
  type CardRequest,
  type CardRoundId,
  type DecisionCardDraft,
  type DurableEvidence,
  type PassageId,
} from '@omne-harness/agent-contract'
import type { Card, CardRef } from '@omne-harness/human-intervention'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

/** 本提供者写在依据里的拥有者名。 */
export const AGENT_CARDS_OWNER = '@omne-harness/harness-server/agent-cards'

/** HITL 的卡片标题上限（码点）。 */
const TITLE_LIMIT = 256

const digestOf = (parts: readonly string[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

/**
 * 一轮卡片在 HITL 的键。passage 与 round 各至多 256 个字符，拼起来超过 HITL 标识的上限，所以取摘要。
 */
export function roundKey(passage: PassageId, round: CardRoundId): string {
  return digestOf([passage, round])
}

/** 一轮卡片的原等待引用：等待由 Agent 拥有，代次固定为 1。 */
export function roundWait(key: string, destination: string) {
  return { owner: 'agent', waitId: `round/${key}`, incarnation: '1', destination } as const
}

/** 一轮卡片里一个步骤的 HITL 操作身份。同一轮的同一步骤总得到同一身份。 */
export function roundOperation(key: string, step: string): string {
  return `agent-cards/${key}/${step}`
}

type Question = Readonly<{
  kind: 'admission' | 'extension'
  cardId: string
  title: string
  description: string
  declineConsequence: string
  options: readonly Readonly<{ id: string; label: string; description: string }>[]
}>

/** 一轮卡片在 HITL 的来源种类与逐卡问题，顺序与请求一致。 */
export type RoundCards = Readonly<{
  kind: 'admission' | 'agent-extension'
  questions: readonly Question[]
}>

const DECLINE = {
  admission: 'The action is not admitted this time.',
  'agent-extension': 'The extension gets no answer.',
} as const

/** 说明的第一句，截到标题上限。 */
function titleOf(explanation: string): string {
  const line = explanation.trim().split('\n', 1)[0] ?? ''
  // A sentence ends at a full-width mark, or at a half-width one before a space or the end.
  const sentence = /^.*?(?:[。！？]|[.!?](?=\s|$))/u.exec(line)?.[0] ?? line
  return [...sentence].slice(0, TITLE_LIMIT).join('')
}

/**
 * 一轮请求变成 HITL 的卡片，草稿原样转写，不加工。卡片身份是请求在本轮里的序号。每张草稿都指向同一个
 * 动作、且 passage 是这个动作的官方准入链时，来源是 admission；其余是 agent-extension。内容放不放得进
 * 一张卡由 HITL 的登记命令判，这里只拒绝读不出草稿与没有说明的请求。
 */
export function roundCards(
  passage: PassageId,
  requests: readonly CardRequest[],
): Outcome<RoundCards, string> {
  if (requests.length === 0) return fail('the round has no card request')
  const drafts: DecisionCardDraft[] = []
  for (const request of requests) {
    const draft = cardDraftOf(request)
    if (draft === null) return fail(`the request ${request.identity} carries no card draft`)
    if (draft.explanation.trim() === '')
      return fail(`the draft of the request ${request.identity} has no explanation`)
    drafts.push(draft)
  }
  const admitted = admissionActionOf(passage)
  const kind =
    admitted !== null && drafts.every(draft => draft.about.action === admitted)
      ? 'admission'
      : 'agent-extension'
  return succeed({
    kind,
    questions: drafts.map((draft, index) => ({
      kind: kind === 'admission' ? 'admission' : 'extension',
      cardId: `c${String(index + 1)}`,
      title: titleOf(draft.explanation),
      description: draft.explanation,
      declineConsequence: DECLINE[kind],
      options: draft.options.map(option => ({
        id: option.id,
        label: option.label,
        description: option.label,
      })),
    })),
  })
}

const CARD_RECORD = 'hitl-card/'

/**
 * 一张卡的依据。它不含请求的修订号，所以呈现的重送与回查给出同一份依据，读卡只凭依据就找得到卡。
 */
export function cardEvidence(card: CardRef): DurableEvidence {
  const { tenantRef, requestId } = card.request
  return {
    owner: AGENT_CARDS_OWNER,
    record: `${CARD_RECORD}${requestId}/${card.cardId}`,
    revision: '1',
    digest: `sha256:${digestOf([tenantRef, requestId, card.cardId])}`,
  }
}

/** 依据所指的卡；不是本提供者给出的依据、不属于这个租户或被改过时为 null。 */
export function cardRefOf(evidence: DurableEvidence, tenantRef: string): CardRef | null {
  if (evidence.owner !== AGENT_CARDS_OWNER || !evidence.record.startsWith(CARD_RECORD)) return null
  const path = evidence.record.slice(CARD_RECORD.length)
  const cut = path.lastIndexOf('/')
  if (cut <= 0 || cut === path.length - 1) return null
  const card = {
    request: { tenantRef, requestId: path.slice(0, cut) },
    cardId: path.slice(cut + 1),
  } as CardRef
  return cardEvidence(card).digest === evidence.digest ? card : null
}

/**
 * 卡片的当前状态到端口的答复（HITL 协议「入口、来源与答复的解释」）：选项为 chosen，原话为 remark，
 * 跳过为 declined，作废为 invalidated，没有决定为 pending。chosen 不带值：选项的效果是出卡方自己的
 * 数据，Agent 以它保存的草稿为准。
 */
export function replyOf(card: Card): CardReply {
  if (card.kind === 'pending') return { kind: 'pending' }
  if (card.kind === 'invalidated')
    return {
      kind: 'invalidated',
      evidence: {
        owner: AGENT_CARDS_OWNER,
        record: `hitl-invalidated/${card.terminalEvidenceRef}`,
        revision: card.revision,
        digest: `sha256:${digestOf([card.terminalEvidenceRef, card.reason])}`,
      },
    }
  const { ref, reply } = card.decision
  const evidence: DurableEvidence = {
    owner: AGENT_CARDS_OWNER,
    record: `hitl-decision/${ref.decisionId}`,
    revision: '1',
    digest: `sha256:${digestOf([JSON.stringify(ref)])}`,
  }
  switch (reply.kind) {
    case 'selection':
      return { kind: 'chosen', option: reply.optionId, value: null, evidence }
    case 'text':
      return { kind: 'remark', text: reply.text, evidence }
    case 'decline':
      return { kind: 'declined', evidence }
  }
}
