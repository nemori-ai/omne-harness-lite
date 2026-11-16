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

export const AGENT_CARDS_OWNER = '@omne-harness/harness-server/agent-cards'

const TITLE_LIMIT = 256

const digestOf = (parts: readonly string[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

export function roundKey(passage: PassageId, round: CardRoundId): string {
  return digestOf([passage, round])
}

export function roundWait(key: string, destination: string) {
  return { owner: 'agent', waitId: `round/${key}`, incarnation: '1', destination } as const
}

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

export type RoundCards = Readonly<{
  kind: 'admission' | 'agent-extension'
  questions: readonly Question[]
}>

const DECLINE = {
  admission: 'The action is not admitted this time.',
  'agent-extension': 'The extension gets no answer.',
} as const

function titleOf(explanation: string): string {
  const line = explanation.trim().split('\n', 1)[0] ?? ''
  const sentence = /^.*?(?:[。！？]|[.!?](?=\s|$))/u.exec(line)?.[0] ?? line
  return [...sentence].slice(0, TITLE_LIMIT).join('')
}

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

export function cardEvidence(card: CardRef): DurableEvidence {
  const { tenantRef, requestId } = card.request
  return {
    owner: AGENT_CARDS_OWNER,
    record: `${CARD_RECORD}${requestId}/${card.cardId}`,
    revision: '1',
    digest: `sha256:${digestOf([tenantRef, requestId, card.cardId])}`,
  }
}

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
