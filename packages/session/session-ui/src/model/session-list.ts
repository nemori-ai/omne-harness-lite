// The session list as a pure state machine, the third axis of SPEC.md「会话管理」. Its events never
// touch the session axis; `workspace.ts` joins the two.
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import type { Notice } from './session-machine.ts'

export type ListAnswer = Awaited<ReturnType<ClientOf<SessionProtocol>['list-sessions']>>
type Listed = Extract<ListAnswer, { outcome: 'succeeded' }>['body']
export type ListedSession = Listed['sessions'][number]
export type ListPage = Readonly<{
  sessions: readonly ListedSession[]
  next: Listed['next']
  completeness: Listed['completeness']
}>

/**
 * `issued` is the last read token: every read takes the next one, so an answer to a read that a
 * newer one replaced never matches. A reading's token is always `issued`.
 */
export type SessionList =
  | Readonly<{ kind: 'unread'; issued: number }>
  /** The first page: it replaces what is shown. */
  | Readonly<{ kind: 'reading'; issued: number; cursor: null; shown: ListPage | null }>
  /** The page after `shown`, from its `next`: it goes after what is shown. */
  | Readonly<{ kind: 'reading'; issued: number; cursor: string; shown: ListPage }>
  | Readonly<{ kind: 'read'; issued: number; page: ListPage }>
  | Readonly<{
      kind: 'failed'
      issued: number
      notice: Notice
      retry: boolean
      shown: ListPage | null
    }>

export type ListEvent =
  | Readonly<{ kind: 'list-load' }>
  | Readonly<{ kind: 'list-more' }>
  | Readonly<{ kind: 'list-read'; token: number; answer: ListAnswer }>

export type ListEffect = Readonly<{ kind: 'list-sessions'; token: number; cursor: string | null }>

export type ListStep = Readonly<{ list: SessionList; effects: readonly ListEffect[] }>

export const UNREAD: SessionList = { kind: 'unread', issued: 0 }

/** What the list shows now: the last page read, kept while a newer read is on its way. */
export function shownBy(list: SessionList): ListPage | null {
  switch (list.kind) {
    case 'unread':
      return null
    case 'read':
      return list.page
    case 'reading':
    case 'failed':
      return list.shown
  }
}

type Reading = Extract<SessionList, { kind: 'reading' }>

function read(reading: Reading): ListStep {
  return {
    list: reading,
    effects: [{ kind: 'list-sessions', token: reading.issued, cursor: reading.cursor }],
  }
}

function readFirst(list: SessionList): ListStep {
  return read({ kind: 'reading', issued: list.issued + 1, cursor: null, shown: shownBy(list) })
}

function readMore(list: SessionList): ListStep {
  if (list.kind !== 'read' || list.page.next === null) return { list, effects: [] }
  return read({
    kind: 'reading',
    issued: list.issued + 1,
    cursor: list.page.next,
    shown: list.page,
  })
}

/** A later page goes after what is shown; a session already there keeps its place. */
function append(shown: ListPage, page: ListPage): ListPage {
  const held = new Set(shown.sessions.map(item => item.session))
  return {
    sessions: [...shown.sessions, ...page.sessions.filter(item => !held.has(item.session))],
    next: page.next,
    completeness:
      shown.completeness === 'partial' || page.completeness === 'partial' ? 'partial' : 'complete',
  }
}

export function stepList(list: SessionList, event: ListEvent): ListStep {
  switch (event.kind) {
    case 'list-load':
      return readFirst(list)
    case 'list-more':
      return readMore(list)
    case 'list-read':
      return list.kind === 'reading' && list.issued === event.token
        ? { list: answered(list, event.answer), effects: [] }
        : { list, effects: [] }
  }
}

function answered(list: Reading, answer: ListAnswer): SessionList {
  switch (answer.outcome) {
    case 'succeeded':
      return {
        kind: 'read',
        issued: list.issued,
        page: list.cursor === null ? answer.body : append(list.shown, answer.body),
      }
    case 'denied':
      return {
        kind: 'failed',
        issued: list.issued,
        notice: { kind: 'refused', text: '没有权限，或登录已失效。' },
        retry: false,
        shown: null,
      }
    default:
      return {
        kind: 'failed',
        issued: list.issued,
        notice: { kind: 'unavailable', text: '会话列表暂时读不到。' },
        retry: true,
        shown: list.shown,
      }
  }
}
