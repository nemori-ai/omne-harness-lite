import type {
  NotificationProtocol,
  NotificationSummaryBody,
  NotificationViewBody,
} from '@omne-harness/notification-protocol'
import type { ClientOf, ObservationEnd } from '@omne-harness/sdk/core'

type Client = ClientOf<NotificationProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>
type NotSent = Readonly<{ outcome: 'unavailable' }>
export type ListAnswer = Answer<'list-inbox'> | NotSent
export type MarkAnswer = Answer<'mark'> | NotSent
export type ReadAnswer = Answer<'read-notification'> | NotSent
export type InboxEnd = ObservationEnd<NotificationProtocol['observations']['observe-changes']>

export type Entry = NotificationSummaryBody
export type Filter = 'unresolved' | 'all'
export type MarkOperation = 'seen' | 'done' | 'dismiss' | 'restore'
export type Ref = Pick<Entry, 'source' | 'event'>

export const keyOf = (ref: Ref): string => JSON.stringify([ref.source, ref.event])

/** How many pages one read takes. Past it the list says that there is more. */
export const PAGE_CAP = 20

export type Read =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{
      kind: 'reading'
      token: number
      collected: readonly Entry[]
      pages: number
      again: boolean
    }>
  | Readonly<{ kind: 'ready'; more: boolean }>
  | Readonly<{ kind: 'failed'; reason: 'unavailable' | 'denied' }>

export type Live =
  | Readonly<{ kind: 'off' }>
  | Readonly<{ kind: 'on' }>
  | Readonly<{ kind: 'retrying'; attempt: number }>
  | Readonly<{ kind: 'denied' }>

/** Why the last thing a person did to one notification did not take effect. */
export type Notice = 'restore-first' | 'superseded' | 'gone' | 'unavailable' | 'unknown' | 'denied'

export type Opened = Readonly<{
  key: string
  token: number
  view: 'reading' | 'gone' | 'unavailable' | NotificationViewBody
}>

export type State = Readonly<{
  filter: Filter
  /** The list as the server last gave it. Marks change only by what the server answered. */
  entries: readonly Entry[]
  read: Read
  live: Live
  generation: number
  tokens: number
  marking: Readonly<Record<string, MarkOperation>>
  notices: Readonly<Record<string, Notice>>
  opened: Opened | null
}>

export const INITIAL: State = {
  filter: 'unresolved',
  entries: [],
  read: { kind: 'idle' },
  live: { kind: 'off' },
  generation: 0,
  tokens: 0,
  marking: {},
  notices: {},
  opened: null,
}

export type Event =
  | Readonly<{ kind: 'watch' | 'unwatch' | 'refresh' | 'close' }>
  | Readonly<{ kind: 'filter'; filter: Filter }>
  | Readonly<{ kind: 'frame'; generation: number; about: 'inbox' | 'catalog' }>
  | Readonly<{ kind: 'observation-ended'; generation: number; denied: boolean }>
  | Readonly<{ kind: 'reconnect-due'; generation: number }>
  | Readonly<{ kind: 'list-answered'; token: number; answer: ListAnswer }>
  | Readonly<{ kind: 'mark'; key: string; operation: MarkOperation }>
  | Readonly<{ kind: 'mark-answered'; key: string; answer: MarkAnswer }>
  | Readonly<{ kind: 'open'; key: string }>
  | Readonly<{ kind: 'read-answered'; token: number; answer: ReadAnswer }>

export type Effect =
  | Readonly<{ kind: 'observe'; generation: number }>
  | Readonly<{ kind: 'stop-observing' }>
  | Readonly<{ kind: 'reconnect-later'; generation: number; attempt: number }>
  | Readonly<{ kind: 'list'; token: number; filter: Filter; after: number | null }>
  | Readonly<{ kind: 'mark'; key: string; ref: Ref; operation: MarkOperation }>
  | Readonly<{ kind: 'read'; token: number; ref: Ref }>

export type Step = Readonly<{ state: State; effects: readonly Effect[] }>

const still = (state: State): Step => ({ state, effects: [] })

/** Reads the list from its start. A read already under way reads once more when it ends. */
function reload(state: State): Step {
  if (state.read.kind === 'reading')
    return still({ ...state, read: { ...state.read, again: true } })
  return restart(state)
}

function restart(state: State): Step {
  const token = state.tokens + 1
  const read: Read = { kind: 'reading', token, collected: [], pages: 1, again: false }
  return {
    state: { ...state, tokens: token, read },
    effects: [{ kind: 'list', token, filter: state.filter, after: null }],
  }
}

function listAnswered(state: State, event: Extract<Event, { kind: 'list-answered' }>): Step {
  const { read } = state
  if (read.kind !== 'reading' || read.token !== event.token) return still(state)
  const { answer } = event
  if (answer.outcome !== 'succeeded') {
    const denied = answer.outcome === 'denied' || answer.outcome === 'not-found'
    const failed: State = {
      ...state,
      entries: denied ? [] : state.entries,
      read: { kind: 'failed', reason: denied ? 'denied' : 'unavailable' },
    }
    return read.again ? restart(failed) : still(failed)
  }
  const collected = [...read.collected, ...answer.body.entries]
  const { next } = answer.body
  if (next !== null && read.pages < PAGE_CAP)
    return {
      state: { ...state, read: { ...read, collected, pages: read.pages + 1 } },
      effects: [{ kind: 'list', token: read.token, filter: state.filter, after: next }],
    }
  const ready: State = {
    ...state,
    entries: collected,
    read: { kind: 'ready', more: next !== null },
  }
  return read.again ? restart(ready) : still(ready)
}

/** Whether an observation ended because the login may not watch this tenant. Any other end is retried. */
export const deniedEnd = (end: InboxEnd): boolean =>
  (end.kind === 'ended' && end.reason === 'denied') ||
  (end.kind === 'refused' && end.outcome === 'denied')

function observationEnded(
  state: State,
  event: Extract<Event, { kind: 'observation-ended' }>,
): Step {
  if (event.generation !== state.generation || state.live.kind === 'off') return still(state)
  if (event.denied)
    return still({
      ...state,
      live: { kind: 'denied' },
      entries: [],
      read: { kind: 'failed', reason: 'denied' },
    })
  const attempt = state.live.kind === 'retrying' ? state.live.attempt + 1 : 1
  const retrying: State = { ...state, live: { kind: 'retrying', attempt } }
  const later: Effect = { kind: 'reconnect-later', generation: state.generation, attempt }
  const read = state.read.kind === 'idle' ? restart(retrying) : still(retrying)
  return { state: read.state, effects: [later, ...read.effects] }
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  const { [key]: _, ...rest } = record
  return rest
}

function mark(state: State, key: string, operation: MarkOperation): Step {
  const entry = state.entries.find(item => keyOf(item) === key)
  if (entry === undefined || key in state.marking) return still(state)
  return {
    state: {
      ...state,
      marking: { ...state.marking, [key]: operation },
      notices: without(state.notices, key),
    },
    effects: [{ kind: 'mark', key, ref: { source: entry.source, event: entry.event }, operation }],
  }
}

const NOTICES = {
  'not-found': 'gone',
  denied: 'denied',
  unknown: 'unknown',
  uncertain: 'unknown',
  invalid: 'unavailable',
  'basis-unavailable': 'unavailable',
  'protocol-rejected': 'unavailable',
  unavailable: 'unavailable',
} as const

function markAnswered(state: State, event: Extract<Event, { kind: 'mark-answered' }>): Step {
  const { key, answer } = event
  if (!(key in state.marking)) return still(state)
  const settled: State = { ...state, marking: without(state.marking, key) }
  if (answer.outcome === 'succeeded' || answer.outcome === 'no-change') {
    const entries = settled.entries.map(entry =>
      keyOf(entry) === key ? { ...entry, marks: answer.body } : entry,
    )
    return still({ ...settled, entries })
  }
  const notice = answer.outcome === 'conflict' ? answer.body.reason : NOTICES[answer.outcome]
  const noted: State = { ...settled, notices: { ...settled.notices, [key]: notice } }
  return notice === 'unavailable' || notice === 'denied' ? still(noted) : reload(noted)
}

function open(state: State, key: string): Step {
  const entry = state.entries.find(item => keyOf(item) === key)
  if (entry === undefined) return still(state)
  const token = state.tokens + 1
  const ref = { source: entry.source, event: entry.event }
  const opened: State = { ...state, tokens: token, opened: { key, token, view: 'reading' } }
  const seen = entry.marks.seenAt === null ? mark(opened, key, 'seen') : still(opened)
  return { state: seen.state, effects: [{ kind: 'read', token, ref }, ...seen.effects] }
}

function readAnswered(state: State, event: Extract<Event, { kind: 'read-answered' }>): Step {
  const { opened } = state
  if (opened === null || opened.token !== event.token) return still(state)
  const { answer } = event
  const view =
    answer.outcome === 'succeeded'
      ? answer.body
      : answer.outcome === 'not-found'
        ? 'gone'
        : 'unavailable'
  return still({ ...state, opened: { ...opened, view } })
}

function frame(state: State, event: Extract<Event, { kind: 'frame' }>): Step {
  if (event.generation !== state.generation || state.live.kind === 'off') return still(state)
  const live: State = state.live.kind === 'on' ? state : { ...state, live: { kind: 'on' } }
  return event.about === 'inbox' ? reload(live) : still(live)
}

export function step(state: State, event: Event): Step {
  switch (event.kind) {
    case 'watch': {
      if (state.live.kind !== 'off') return still(state)
      const generation = state.generation + 1
      return {
        state: { ...state, generation, live: { kind: 'on' } },
        effects: [{ kind: 'observe', generation }],
      }
    }
    case 'unwatch':
      if (state.live.kind === 'off') return still(state)
      return { state: { ...state, live: { kind: 'off' } }, effects: [{ kind: 'stop-observing' }] }
    case 'refresh':
      return reload(state)
    case 'filter':
      return event.filter === state.filter
        ? still(state)
        : restart({ ...state, filter: event.filter })
    case 'frame':
      return frame(state, event)
    case 'observation-ended':
      return observationEnded(state, event)
    case 'reconnect-due': {
      if (event.generation !== state.generation || state.live.kind !== 'retrying')
        return still(state)
      const generation = state.generation + 1
      return { state: { ...state, generation }, effects: [{ kind: 'observe', generation }] }
    }
    case 'list-answered':
      return listAnswered(state, event)
    case 'mark':
      return mark(state, event.key, event.operation)
    case 'mark-answered':
      return markAnswered(state, event)
    case 'open':
      return open(state, event.key)
    case 'close':
      return still(state.opened === null ? state : { ...state, opened: null })
    case 'read-answered':
      return readAnswered(state, event)
  }
}

const newestFirst = (a: Entry, b: Entry) => b.sequence - a.sequence
const isOpen = (entry: Entry) => entry.marks.resolved === null && entry.marks.supersededBy === null

/** The two sections of the panel, newest first. A notification a newer one replaced counts as settled. */
export function sectionsOf(
  state: State,
): Readonly<{ open: readonly Entry[]; settled: readonly Entry[] }> {
  const sorted = [...state.entries].sort(newestFirst)
  return { open: sorted.filter(isOpen), settled: sorted.filter(entry => !isOpen(entry)) }
}

export const openCount = (state: State): number => state.entries.filter(isOpen).length
