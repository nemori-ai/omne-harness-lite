import type {
  HumanInterventionCardItem,
  HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import type { BodyOf, ClientOf } from '@omne-harness/sdk/core'

type Client = ClientOf<HumanInterventionProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>
export type ListAnswer = Answer<'list-cards'>
export type ReplyAnswer = Answer<'submit-reply'> | Answer<'query-submit-reply'>
export type Reply = BodyOf<HumanInterventionProtocol['operations']['submit-reply']>['reply']
export type CardRef = HumanInterventionCardItem['card']['ref']

export type Notice = Readonly<{
  kind: 'done' | 'refused' | 'unavailable' | 'unknown'
  text: string
}>

export type Sent = Readonly<{
  card: CardRef
  expectedRevision: string
  reply: Reply
  replyId: string
}>

export type Submit =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'submitting'; sent: Sent }>
  | Readonly<{ kind: 'unknown'; sent: Sent; confirming: boolean; notice: Notice }>
  | Readonly<{ kind: 'refused'; notice: Notice }>

export type Entry = Readonly<{ key: string; item: HumanInterventionCardItem; submit: Submit }>

export type Read =
  | Readonly<{ kind: 'never' }>
  | Readonly<{
      kind: 'reading'
      token: number
      collected: readonly HumanInterventionCardItem[]
      partial: boolean
    }>
  | Readonly<{ kind: 'read'; partial: boolean }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type State = Readonly<{
  entries: readonly Entry[]
  read: Read
  issued: number
  last: Notice | null
}>

export type Event =
  | Readonly<{ kind: 'read-list' }>
  | Readonly<{ kind: 'list-answered'; token: number; answer: ListAnswer }>
  | Readonly<{ kind: 'submit'; key: string; reply: Reply; replyId: string }>
  | Readonly<{ kind: 'reply-answered'; key: string; replyId: string; answer: ReplyAnswer }>
  | Readonly<{ kind: 'confirm'; key: string }>

export type Effect =
  | Readonly<{ kind: 'list'; token: number; cursor: string | null }>
  | Readonly<{ kind: 'submit'; key: string; sent: Sent }>
  | Readonly<{ kind: 'query'; key: string; sent: Sent }>

export type Step = Readonly<{ state: State; effects: readonly Effect[] }>

export const INITIAL: State = { entries: [], read: { kind: 'never' }, issued: 0, last: null }

export const keyOf = (ref: CardRef): string =>
  JSON.stringify([ref.request.tenantRef, ref.request.requestId, ref.cardId])

const same = (state: State): Step => ({ state, effects: [] })

type Refusal = Exclude<
  ListAnswer['outcome'] | ReplyAnswer['outcome'],
  'succeeded' | 'not-committed' | 'unknown'
>

const READ_SENTENCES: Readonly<Record<Refusal, string>> = {
  denied: '没有权限，或登录已失效。',
  invalid: '服务端认为这次读取的条件不合规定。',
  limited: '超出了服务端的上限，没有读出来。',
  conflict: '列表在读的时候变了，没有读完。',
  'basis-unavailable': '服务端暂时读不出需要的依据，稍后再试。',
  'protocol-rejected': '服务端不认这个请求的格式。',
  unavailable: '没有发出去。',
  uncertain: '没有收到可信的答复。',
}

const SUBMIT_SENTENCES: Readonly<Record<Refusal, string>> = {
  denied: '没有权限，或登录已失效。没有提交。',
  invalid: '服务端认为这份答复不合这张卡的规定，没有提交。',
  limited: '答复超出了服务端的上限，没有提交。',
  conflict: '这张卡在别处变了，没有提交。已重新读取。',
  'basis-unavailable': '服务端暂时读不出需要的依据，没有提交。稍后再试。',
  'protocol-rejected': '服务端不认这个请求的格式，没有提交。',
  unavailable: '没有发出去。',
  uncertain: '没有收到可信的答复。',
}

const INVALIDATED: Readonly<Record<string, string>> = {
  cancelled: '这张卡已经作废：那一轮被取消了。',
  archived: '这张卡已经作废：会话已归档。',
  'origin-terminal': '这张卡已经作废：提问的那一方已经结束。',
  'continuity-lost': '这张卡已经作废：提问的那一方接不上了。',
}

export const SUBMITTED: Notice = { kind: 'done', text: '已提交。' }
export const ALREADY_DECIDED: Notice = {
  kind: 'done',
  text: '这张卡已经有了决定，这次的答复没有采用。',
}
const INVALIDATED_OTHER = '这张卡已经作废。'
export const CONFIRMING: Notice = { kind: 'unknown', text: '结果未知，正在确认。' }
export const STILL_UNKNOWN: Notice = {
  kind: 'unknown',
  text: '结果仍未知：这次确认没有说出原来那次提交了没有。',
}
export const NOT_COMMITTED: Notice = {
  kind: 'refused',
  text: '确认过了：原来那次没有提交上。可以再提交。',
}

function refusal(outcome: Refusal, sentences: Readonly<Record<Refusal, string>>): Notice {
  return {
    kind: outcome === 'unavailable' || outcome === 'uncertain' ? 'unavailable' : 'refused',
    text: sentences[outcome],
  }
}

function readList(state: State): Step {
  const token = state.issued + 1
  return {
    state: {
      ...state,
      read: { kind: 'reading', token, collected: [], partial: false },
      issued: token,
    },
    effects: [{ kind: 'list', token, cursor: null }],
  }
}

const busy = (submit: Submit): boolean => submit.kind === 'submitting' || submit.kind === 'unknown'

function merge(entries: readonly Entry[], items: readonly HumanInterventionCardItem[]): Entry[] {
  const known = new Map(entries.map(entry => [entry.key, entry]))
  const listed = items.map(item => {
    const key = keyOf(item.card.ref)
    return { key, item, submit: known.get(key)?.submit ?? { kind: 'none' as const } }
  })
  const keys = new Set(listed.map(entry => entry.key))
  const kept = entries.filter(entry => busy(entry.submit) && !keys.has(entry.key))
  return [...listed, ...kept]
}

function listAnswered(state: State, token: number, answer: ListAnswer): Step {
  const read = state.read
  if (read.kind !== 'reading' || read.token !== token) return same(state)
  if (answer.outcome !== 'succeeded')
    return same({
      ...state,
      read: { kind: 'failed', notice: refusal(answer.outcome, READ_SENTENCES) },
    })
  const page = answer.body
  const collected = [...read.collected, ...page.items]
  const partial = read.partial || page.completeness === 'partial'
  if (page.next !== null)
    return {
      state: { ...state, read: { kind: 'reading', token, collected, partial } },
      effects: [{ kind: 'list', token, cursor: page.next }],
    }
  return same({
    ...state,
    entries: merge(state.entries, collected),
    read: { kind: 'read', partial },
  })
}

function put(state: State, entry: Entry, effects: readonly Effect[] = []): Step {
  return {
    state: {
      ...state,
      entries: state.entries.map(candidate => (candidate.key === entry.key ? entry : candidate)),
    },
    effects,
  }
}

function submit(state: State, key: string, reply: Reply, replyId: string): Step {
  const entry = state.entries.find(candidate => candidate.key === key)
  if (entry === undefined || busy(entry.submit)) return same(state)
  const sent: Sent = {
    card: entry.item.card.ref,
    expectedRevision: entry.item.card.revision,
    reply,
    replyId,
  }
  return put(state, { ...entry, submit: { kind: 'submitting', sent } }, [
    { kind: 'submit', key, sent },
  ])
}

function settled(state: State, key: string, last: Notice): Step {
  const kept = { ...state, entries: state.entries.filter(entry => entry.key !== key), last }
  return readList(kept)
}

function replyAnswered(state: State, key: string, replyId: string, answer: ReplyAnswer): Step {
  const entry = state.entries.find(candidate => candidate.key === key)
  if (entry === undefined) return same(state)
  const current = entry.submit
  const inFlight =
    current.kind === 'submitting' || (current.kind === 'unknown' && current.confirming)
  if (!inFlight || current.sent.replyId !== replyId) return same(state)
  const sent = current.sent
  const recognizing = current.kind === 'unknown'
  const into = (submit: Submit, effects: readonly Effect[] = []): Step =>
    put(state, { ...entry, submit }, effects)
  switch (answer.outcome) {
    case 'succeeded': {
      const result = answer.body
      if (result.kind === 'decided') return settled(state, key, SUBMITTED)
      if (result.kind === 'already-decided') return settled(state, key, ALREADY_DECIDED)
      return settled(state, key, {
        kind: 'done',
        text: INVALIDATED[result.reason] ?? INVALIDATED_OTHER,
      })
    }
    case 'not-committed':
      return into({ kind: 'refused', notice: NOT_COMMITTED })
    case 'unknown':
    case 'uncertain':
      if (recognizing)
        return into({ kind: 'unknown', sent, confirming: false, notice: STILL_UNKNOWN })
      return into({ kind: 'unknown', sent, confirming: true, notice: CONFIRMING }, [
        { kind: 'query', key, sent },
      ])
    default:
      if (recognizing)
        return into({ kind: 'unknown', sent, confirming: false, notice: STILL_UNKNOWN })
      if (answer.outcome === 'conflict') {
        const refused = into({
          kind: 'refused',
          notice: refusal('conflict', SUBMIT_SENTENCES),
        }).state
        return readList(refused)
      }
      return into({ kind: 'refused', notice: refusal(answer.outcome, SUBMIT_SENTENCES) })
  }
}

function confirm(state: State, key: string): Step {
  const entry = state.entries.find(candidate => candidate.key === key)
  if (entry === undefined) return same(state)
  const current = entry.submit
  if (current.kind !== 'unknown' || current.confirming) return same(state)
  return put(state, { ...entry, submit: { ...current, confirming: true, notice: CONFIRMING } }, [
    { kind: 'query', key, sent: current.sent },
  ])
}

export function step(state: State, event: Event): Step {
  switch (event.kind) {
    case 'read-list':
      return state.read.kind === 'reading' ? same(state) : readList(state)
    case 'list-answered':
      return listAnswered(state, event.token, event.answer)
    case 'submit':
      return submit(state, event.key, event.reply, event.replyId)
    case 'reply-answered':
      return replyAnswered(state, event.key, event.replyId, event.answer)
    case 'confirm':
      return confirm(state, event.key)
  }
}
