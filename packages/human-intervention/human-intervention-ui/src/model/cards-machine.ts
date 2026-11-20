import type {
  HumanInterventionCardItem,
  HumanInterventionProtocol,
} from '@omne-harness/human-intervention-protocol'
import type { BodyOf, ClientOf, ObservationEnd } from '@omne-harness/sdk/core'

type Client = ClientOf<HumanInterventionProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>
export type ListAnswer = Answer<'list-cards'>
export type ReplyAnswer = Answer<'submit-reply'> | Answer<'query-submit-reply'>
export type Reply = BodyOf<HumanInterventionProtocol['operations']['submit-reply']>['reply']
export type CardRef = HumanInterventionCardItem['card']['ref']
export type CardsEnd = ObservationEnd<HumanInterventionProtocol['observations']['observe-cards']>

export type Notice = Readonly<{
  kind: 'done' | 'refused' | 'unavailable' | 'unknown'
  text: string
}>

export type Live =
  | Readonly<{ kind: 'off' }>
  | Readonly<{ kind: 'on'; generation: number; attempt: number }>
  | Readonly<{ kind: 'retrying'; generation: number; attempt: number }>
  | Readonly<{ kind: 'denied' }>

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

export type Choice =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'option'; optionId: string }>
  | Readonly<{ kind: 'decline' }>

export type Draft = Readonly<{ choice: Choice; text: string }>

export type Planned = Readonly<{ key: string; replyId: string }>

export type Queued = Readonly<{ key: string; sent: Sent }>

export type Batch = Readonly<{ queue: readonly Queued[] }>

export type Closed = Readonly<{
  key: string
  item: HumanInterventionCardItem
  draft: Draft
  notice: Notice
}>

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
  again: boolean
  live: Live
  generations: number
  drafts: Readonly<Record<string, Draft>>
  batches: Readonly<Record<string, Batch>>
  closed: readonly Closed[]
}>

/** The awaiting-answer count: the cards listed as waiting for the person to answer. */
export const awaitingCount = (state: State): number => state.entries.length

export type Event =
  | Readonly<{ kind: 'read-list' }>
  | Readonly<{ kind: 'list-answered'; token: number; answer: ListAnswer }>
  | Readonly<{ kind: 'draft'; key: string; draft: Draft }>
  | Readonly<{ kind: 'submit-group'; group: string; planned: readonly Planned[] }>
  | Readonly<{ kind: 'reply-answered'; key: string; replyId: string; answer: ReplyAnswer }>
  | Readonly<{ kind: 'confirm'; key: string }>
  | Readonly<{ kind: 'dismiss'; key: string }>
  | Readonly<{ kind: 'watch' }>
  | Readonly<{ kind: 'unwatch' }>
  | Readonly<{ kind: 'frame'; generation: number }>
  | Readonly<{ kind: 'observation-ended'; generation: number; end: CardsEnd }>
  | Readonly<{ kind: 'reconnect-due'; generation: number }>

export type Effect =
  | Readonly<{ kind: 'list'; token: number; cursor: string | null }>
  | Readonly<{ kind: 'submit'; key: string; sent: Sent }>
  | Readonly<{ kind: 'query'; key: string; sent: Sent }>
  | Readonly<{ kind: 'observe'; generation: number }>
  | Readonly<{ kind: 'stop-observing' }>
  | Readonly<{ kind: 'reconnect-later'; generation: number; attempt: number }>

export type Step = Readonly<{ state: State; effects: readonly Effect[] }>

export const EMPTY_DRAFT: Draft = { choice: { kind: 'none' }, text: '' }

export const INITIAL: State = {
  entries: [],
  read: { kind: 'never' },
  issued: 0,
  again: false,
  live: { kind: 'off' },
  generations: 0,
  drafts: {},
  batches: {},
  closed: [],
}

export const keyOf = (ref: CardRef): string =>
  JSON.stringify([ref.request.tenantRef, ref.request.requestId, ref.cardId])

export const groupOf = (item: HumanInterventionCardItem): string => item.origin.sessionRef ?? ''

export function replyOf(draft: Draft | undefined): Reply | null {
  if (draft === undefined) return null
  if (draft.choice.kind === 'option') return { kind: 'selection', optionId: draft.choice.optionId }
  if (draft.choice.kind === 'decline') return { kind: 'decline' }
  return draft.text.trim() === '' ? null : { kind: 'text', text: draft.text }
}

export const busy = (submit: Submit): boolean =>
  submit.kind === 'submitting' || submit.kind === 'unknown'

export type Sheet = Readonly<{
  entries: readonly Entry[]
  closed: readonly Closed[]
  running: boolean
  missing: readonly string[]
  open: readonly string[]
  ready: boolean
}>

type Sendable = Readonly<{ entry: Entry; reply: Reply | null }>

function sendableOf(state: State, group: string): readonly Sendable[] {
  return state.entries
    .filter(entry => groupOf(entry.item) === group && !busy(entry.submit))
    .map(entry => ({ entry, reply: replyOf(state.drafts[entry.key]) }))
}

const leavable = (entry: Entry): boolean => entry.item.card.question.kind === 'release'

const answeredOf = (state: State, group: string): readonly Sendable[] =>
  sendableOf(state, group).filter(item => item.reply !== null)

export function sheetOf(state: State, group: string): Sheet {
  const unanswered = sendableOf(state, group).filter(item => item.reply === null)
  const keysOf = (items: readonly Sendable[]) => items.map(item => item.entry.key)
  const missing = keysOf(unanswered.filter(item => !leavable(item.entry)))
  const running = state.batches[group] !== undefined
  return {
    entries: state.entries.filter(entry => groupOf(entry.item) === group),
    closed: state.closed.filter(closed => groupOf(closed.item) === group),
    running,
    missing,
    open: keysOf(unanswered.filter(item => leavable(item.entry))),
    ready: !running && answeredOf(state, group).length > 0 && missing.length === 0,
  }
}

export function submittable(state: State, group: string): readonly string[] {
  return sheetOf(state, group).ready ? answeredOf(state, group).map(item => item.entry.key) : []
}

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
  denied: '没有权限，或登录已失效。这一题没有记上。',
  invalid: '服务端认为这份答复不合这张卡的规定，这一题没有记上。',
  limited: '答复超出了服务端的上限，这一题没有记上。',
  conflict: '这张卡在别处变了，这一题没有记上。已重新读取。',
  'basis-unavailable': '服务端暂时读不出需要的依据，这一题没有记上。稍后再试。',
  'protocol-rejected': '服务端不认这个请求的格式，这一题没有记上。',
  unavailable: '没有发出去，这一题没有记上。',
  uncertain: '没有收到可信的答复。',
}

const INVALIDATED: Readonly<Record<string, string>> = {
  cancelled: '这次提问已经关掉：那一轮被取消了。',
  archived: '这次提问已经关掉：会话已归档。',
  'origin-terminal': '这次提问已经关掉：提问的那一方已经结束。',
  'continuity-lost': '这次提问已经关掉：提问的那一方接不上了。',
}

export const ALREADY_DECIDED: Notice = {
  kind: 'done',
  text: '已在别处答了，这次的答复没有采用。',
}
const INVALIDATED_OTHER = '这次提问已经关掉。'
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

const queued = (state: State, key: string): boolean =>
  Object.values(state.batches).some(batch => batch.queue.some(item => item.key === key))

function merge(state: State, items: readonly HumanInterventionCardItem[]): State {
  const known = new Map(state.entries.map(entry => [entry.key, entry]))
  const listed = items.map(item => {
    const key = keyOf(item.card.ref)
    return { key, item, submit: known.get(key)?.submit ?? { kind: 'none' as const } }
  })
  const keys = new Set(listed.map(entry => entry.key))
  const kept = state.entries.filter(
    entry => !keys.has(entry.key) && (busy(entry.submit) || queued(state, entry.key)),
  )
  const entries = [...listed, ...kept]
  const present = new Set(entries.map(entry => entry.key))
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).filter(([key]) => present.has(key)),
  )
  return { ...state, entries, drafts }
}

function readDone(state: State): Step {
  return state.again ? readList({ ...state, again: false }) : same(state)
}

function listAnswered(state: State, token: number, answer: ListAnswer): Step {
  const read = state.read
  if (read.kind !== 'reading' || read.token !== token) return same(state)
  if (answer.outcome !== 'succeeded')
    return readDone({
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
  return readDone({ ...merge(state, collected), read: { kind: 'read', partial } })
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

const find = (state: State, key: string): Entry | undefined =>
  state.entries.find(candidate => candidate.key === key)

function draft(state: State, key: string, value: Draft): Step {
  const entry = find(state, key)
  if (entry === undefined || busy(entry.submit)) return same(state)
  if (state.batches[groupOf(entry.item)] !== undefined) return same(state)
  return same({ ...state, drafts: { ...state.drafts, [key]: value } })
}

function withoutBatch(state: State, group: string): State {
  const { [group]: _ended, ...rest } = state.batches
  return { ...state, batches: rest }
}

function proceed(state: State, group: string, queue: readonly Queued[]): Step {
  const [head] = queue
  if (head === undefined) return same(withoutBatch(state, group))
  const submit: Submit = { kind: 'submitting', sent: head.sent }
  return {
    state: {
      ...state,
      batches: { ...state.batches, [group]: { queue } },
      entries: state.entries.map(entry => (entry.key === head.key ? { ...entry, submit } : entry)),
    },
    effects: [{ kind: 'submit', key: head.key, sent: head.sent }],
  }
}

function submitGroup(state: State, group: string, plan: readonly Planned[]): Step {
  if (!sheetOf(state, group).ready) return same(state)
  const sendable = answeredOf(state, group)
  const queue = sendable.flatMap(({ entry, reply }, at) => {
    const planned = plan[at]
    if (reply === null || planned?.key !== entry.key) return []
    const sent: Sent = {
      card: entry.item.card.ref,
      expectedRevision: entry.item.card.revision,
      reply,
      replyId: planned.replyId,
    }
    return [{ key: entry.key, sent }]
  })
  const distinct = new Set(plan.map(item => item.replyId)).size === plan.length
  const exact = queue.length === sendable.length && plan.length === sendable.length
  if (!exact || !distinct) return same(state)
  return proceed(state, group, queue)
}

function advance(step: Step, group: string, key: string): Step {
  const queue = step.state.batches[group]?.queue
  if (queue === undefined || queue[0]?.key !== key) return step
  const next = proceed(step.state, group, queue.slice(1))
  return { state: next.state, effects: [...step.effects, ...next.effects] }
}

function dropDraft(drafts: Readonly<Record<string, Draft>>, key: string) {
  const { [key]: _gone, ...rest } = drafts
  return rest
}

function settled(state: State, entry: Entry, closedBy: Notice | null): Step {
  const remaining = state.entries.filter(candidate => candidate.key !== entry.key)
  const closed =
    closedBy === null
      ? state.closed
      : [
          ...state.closed,
          {
            key: entry.key,
            item: entry.item,
            draft: state.drafts[entry.key] ?? EMPTY_DRAFT,
            notice: closedBy,
          },
        ]
  return readList({
    ...state,
    entries: remaining,
    drafts: dropDraft(state.drafts, entry.key),
    closed,
  })
}

type Succeeded = Extract<ReplyAnswer, { outcome: 'succeeded' }>['body']

function closedBy(result: Succeeded): Notice | null {
  if (result.kind === 'decided') return null
  if (result.kind === 'already-decided') return ALREADY_DECIDED
  return { kind: 'done', text: INVALIDATED[result.reason] ?? INVALIDATED_OTHER }
}

type InFlight = Readonly<{ sent: Sent; recognizing: boolean }>

function outcomeOf(state: State, entry: Entry, flight: InFlight, answer: ReplyAnswer): Step {
  const { sent, recognizing } = flight
  const into = (submit: Submit, effects: readonly Effect[] = []): Step =>
    put(state, { ...entry, submit }, effects)
  if (answer.outcome === 'succeeded') return settled(state, entry, closedBy(answer.body))
  if (answer.outcome === 'not-committed') return into({ kind: 'refused', notice: NOT_COMMITTED })
  if (recognizing) return into({ kind: 'unknown', sent, confirming: false, notice: STILL_UNKNOWN })
  if (answer.outcome === 'unknown' || answer.outcome === 'uncertain')
    return into({ kind: 'unknown', sent, confirming: true, notice: CONFIRMING }, [
      { kind: 'query', key: entry.key, sent },
    ])
  const refused = into({ kind: 'refused', notice: refusal(answer.outcome, SUBMIT_SENTENCES) })
  return answer.outcome === 'conflict' ? readList(refused.state) : refused
}

function inFlightOf(submit: Submit, replyId: string): InFlight | null {
  if (submit.kind === 'submitting' && submit.sent.replyId === replyId)
    return { sent: submit.sent, recognizing: false }
  if (submit.kind === 'unknown' && submit.confirming && submit.sent.replyId === replyId)
    return { sent: submit.sent, recognizing: true }
  return null
}

function replyAnswered(state: State, key: string, replyId: string, answer: ReplyAnswer): Step {
  const entry = find(state, key)
  if (entry === undefined) return same(state)
  const flight = inFlightOf(entry.submit, replyId)
  if (flight === null) return same(state)
  return advance(outcomeOf(state, entry, flight, answer), groupOf(entry.item), key)
}

function confirm(state: State, key: string): Step {
  const entry = find(state, key)
  if (entry === undefined) return same(state)
  const current = entry.submit
  if (current.kind !== 'unknown' || current.confirming) return same(state)
  return put(state, { ...entry, submit: { ...current, confirming: true, notice: CONFIRMING } }, [
    { kind: 'query', key, sent: current.sent },
  ])
}

function dismiss(state: State, key: string): Step {
  if (!state.closed.some(closed => closed.key === key)) return same(state)
  return same({ ...state, closed: state.closed.filter(closed => closed.key !== key) })
}

function observe(state: State, attempt: number): Step {
  const generation = state.generations + 1
  const read = readList({
    ...state,
    generations: generation,
    live: { kind: 'on', generation, attempt },
  })
  return { state: read.state, effects: [...read.effects, { kind: 'observe', generation }] }
}

function frame(state: State, generation: number): Step {
  const live = state.live
  if (live.kind !== 'on' || live.generation !== generation) return same(state)
  const settledLive: State =
    live.attempt === 0 ? state : { ...state, live: { ...live, attempt: 0 } }
  return settledLive.read.kind === 'reading'
    ? same({ ...settledLive, again: true })
    : readList(settledLive)
}

const deniedEnd = (end: CardsEnd): boolean =>
  (end.kind === 'ended' && end.reason === 'denied') ||
  (end.kind === 'refused' && end.outcome === 'denied')

function observationEnded(state: State, generation: number, end: CardsEnd): Step {
  const live = state.live
  if (live.kind === 'off' || live.kind === 'denied' || live.generation !== generation)
    return same(state)
  if (deniedEnd(end)) return same({ ...state, live: { kind: 'denied' } })
  if (end.kind === 'aborted') return same(state)
  const attempt = live.attempt + 1
  return {
    state: { ...state, live: { kind: 'retrying', generation, attempt } },
    effects: [{ kind: 'reconnect-later', generation, attempt }],
  }
}

function reconnectDue(state: State, generation: number): Step {
  const live = state.live
  if (live.kind !== 'retrying' || live.generation !== generation) return same(state)
  return observe(state, live.attempt)
}

type Handlers = {
  readonly [K in Event['kind']]: (state: State, event: Extract<Event, { kind: K }>) => Step
}

const HANDLERS: Handlers = {
  'read-list': state => (state.read.kind === 'reading' ? same(state) : readList(state)),
  'list-answered': (state, event) => listAnswered(state, event.token, event.answer),
  draft: (state, event) => draft(state, event.key, event.draft),
  'submit-group': (state, event) => submitGroup(state, event.group, event.planned),
  'reply-answered': (state, event) => replyAnswered(state, event.key, event.replyId, event.answer),
  confirm: (state, event) => confirm(state, event.key),
  dismiss: (state, event) => dismiss(state, event.key),
  watch: state => (state.live.kind === 'off' ? observe(state, 0) : same(state)),
  unwatch: state =>
    state.live.kind === 'off'
      ? same(state)
      : { state: { ...state, live: { kind: 'off' } }, effects: [{ kind: 'stop-observing' }] },
  frame: (state, event) => frame(state, event.generation),
  'observation-ended': (state, event) => observationEnded(state, event.generation, event.end),
  'reconnect-due': (state, event) => reconnectDue(state, event.generation),
}

export function step(state: State, event: Event): Step {
  const handle = HANDLERS[event.kind] as (state: State, event: Event) => Step
  return handle(state, event)
}
