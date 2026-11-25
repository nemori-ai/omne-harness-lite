import type { AssetsProtocol, SettingView } from '@omne-harness/assets-protocol'
import type { JsonValue } from '@omne-harness/json-text'
import type { ClientOf } from '@omne-harness/sdk/core'
import { COMMON_SENTENCES, refusal, type Notice } from './notices.ts'

type Client = ClientOf<AssetsProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>
export type ListAnswer = Answer<'list-settings'>
export type DescribeAnswer = Answer<'describe-setting'>
export type WriteAnswer = Answer<'set-setting'> | Answer<'clear-setting'>

export type { Notice } from './notices.ts'

export type WriteRequest =
  | Readonly<{ kind: 'set'; pick: string }>
  | Readonly<{ kind: 'set-value'; value: JsonValue }>
  | Readonly<{ kind: 'set-secret' }>
  | Readonly<{ kind: 'clear' }>

export type Sent = Readonly<{ operation: string; expectedRevision: string; request: WriteRequest }>

export type Write =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'submitting'; sent: Sent }>
  | Readonly<{ kind: 'unknown'; sent: Sent; confirming: boolean; notice: Notice }>
  | Readonly<{ kind: 'unconfirmed'; notice: Notice }>
  | Readonly<{ kind: 'succeeded'; change: 'written' | 'no-change' }>
  | Readonly<{ kind: 'refused'; notice: Notice }>

export type RowRead =
  | Readonly<{ kind: 'read' }>
  | Readonly<{ kind: 'reading'; token: number }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type Row = Readonly<{ key: string; view: SettingView; read: RowRead; write: Write }>

/** A read after a change elsewhere; rows stay in use meanwhile; `stale` means one more read follows. */
export type Refresh = Readonly<{
  token: number
  rows: readonly Row[]
  partial: boolean
  stale: boolean
}>

export type List =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{
      kind: 'reading'
      token: number
      rows: readonly Row[]
      partial: boolean
      stale: boolean
    }>
  | Readonly<{ kind: 'read'; rows: readonly Row[]; partial: boolean; refresh?: Refresh }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type State = Readonly<{
  list: List
  /** The last read token issued: a new read takes the next one, so a stale answer never matches. */
  issued: number
}>

export type Target = Readonly<{ owner: SettingView['owner']; item: string }>

export type Event =
  | Readonly<{ kind: 'read-list' }>
  | Readonly<{ kind: 'changed' }>
  | Readonly<{ kind: 'list-answered'; token: number; answer: ListAnswer }>
  | Readonly<{ kind: 'set'; key: string; pick: string; operation: string }>
  | Readonly<{ kind: 'set-value'; key: string; value: JsonValue; operation: string }>
  | Readonly<{ kind: 'set-secret'; key: string; secret: string; operation: string }>
  | Readonly<{ kind: 'clear'; key: string; operation: string }>
  | Readonly<{ kind: 'write-answered'; key: string; operation: string; answer: WriteAnswer }>
  | Readonly<{ kind: 'confirm'; key: string }>
  | Readonly<{ kind: 'describe-answered'; key: string; token: number; answer: DescribeAnswer }>
  | Readonly<{ kind: 'retry-row'; key: string }>

export type Effect =
  | Readonly<{ kind: 'list'; token: number; after: string | null }>
  | Readonly<{ kind: 'describe'; key: string; token: number; target: Target }>
  | Readonly<{ kind: 'write'; key: string; target: Target; sent: Sent; secret?: string }>

export type Step = Readonly<{ state: State; effects: readonly Effect[] }>

export const INITIAL: State = { list: { kind: 'unread' }, issued: 0 }

export const keyOf = ({ owner, item }: Target): string =>
  JSON.stringify(
    owner.kind === 'asset'
      ? [owner.kind, owner.category, owner.name, item]
      : [owner.kind, owner.providerId, owner.definitionId, item],
  )

const targetOf = (view: SettingView): Target => ({ owner: view.owner, item: view.item })

const same = (state: State): Step => ({ state, effects: [] })

type Refusal = Exclude<
  ListAnswer['outcome'] | DescribeAnswer['outcome'] | WriteAnswer['outcome'],
  'succeeded' | 'no-change' | 'not-writable' | 'unknown'
>
type NotWritable = Extract<WriteAnswer, { outcome: 'not-writable' }>['body']['reason']

const SENTENCES: Readonly<Record<Refusal, string>> = {
  ...COMMON_SENTENCES,
  'not-visible': '这一项现在看不到了：资产没有持有，或声明里没有这一项。',
  conflict: '这一项在别处改过了，没有写入。已重新读取。',
  invalid: '服务端认为这个值不合这一项的规定，没有写入。',
  'basis-unavailable': '服务端暂时读不出需要的依据，没有写入。稍后再试。',
}

const READ_SENTENCES: Readonly<Record<Refusal, string>> = {
  ...SENTENCES,
  conflict: '资产对上了多份持有或多个在用的版本，读不出唯一的一份。',
  'basis-unavailable': '服务端暂时读不出需要的依据，稍后再试。',
}

const NOT_WRITABLE: Readonly<Record<NotWritable, string>> = {
  locked: '被上层锁定，这一层不能改。',
  'out-of-bound': '这一档越过了上层允许的范围，没有写入。',
  'prohibited-above': '上层已经主动禁止，这一层不能放开。',
  'not-a-source': '这一层不能配这一项。',
}

const notice = (outcome: Refusal, sentences: Readonly<Record<Refusal, string>>): Notice =>
  refusal(outcome, sentences[outcome])

function readList(state: State): Step {
  const token = state.issued + 1
  return {
    state: {
      list: { kind: 'reading', token, rows: [], partial: false, stale: false },
      issued: token,
    },
    effects: [{ kind: 'list', token, after: null }],
  }
}

function refresh(state: State, list: ReadList): Step {
  const token = state.issued + 1
  return {
    state: {
      issued: token,
      list: { ...list, refresh: { token, rows: [], partial: false, stale: false } },
    },
    effects: [{ kind: 'list', token, after: null }],
  }
}

/** A change while a read runs only marks it: one read in flight at a time, one more after it. */
function changed(state: State): Step {
  const list = state.list
  switch (list.kind) {
    case 'unread':
    case 'failed':
      return readList(state)
    case 'reading':
      return list.stale ? same(state) : same({ ...state, list: { ...list, stale: true } })
    case 'read':
      if (list.refresh === undefined) return refresh(state, list)
      if (list.refresh.stale) return same(state)
      return same({ ...state, list: { ...list, refresh: { ...list.refresh, stale: true } } })
  }
}

const finished = (state: State, read: ReadList, stale: boolean): Step =>
  stale ? refresh(state, read) : same({ ...state, list: read })

type Page = Extract<ListAnswer, { outcome: 'succeeded' }>['body']

function gather(rows: readonly Row[], page: Page): readonly Row[] {
  const known = new Map(rows.map(row => [row.key, row]))
  for (const view of page.items) {
    const key = keyOf(view)
    known.set(key, { key, view, read: { kind: 'read' }, write: { kind: 'none' } })
  }
  return [...known.values()]
}

/** The rows of a finished refresh keep the write and any row read in flight of the rows before. */
function refreshAnswered(state: State, list: ReadList, running: Refresh, answer: ListAnswer): Step {
  if (answer.outcome !== 'succeeded')
    return same({
      ...state,
      list: { kind: 'failed', notice: notice(answer.outcome, READ_SENTENCES) },
    })
  const gathered = gather(running.rows, answer.body)
  const partial = running.partial || answer.body.completeness === 'partial'
  if (answer.body.next !== null)
    return {
      state: { ...state, list: { ...list, refresh: { ...running, rows: gathered, partial } } },
      effects: [{ kind: 'list', token: running.token, after: answer.body.next }],
    }
  const before = new Map(list.rows.map(row => [row.key, row]))
  const rows = gathered.map(row => {
    const kept = before.get(row.key)
    if (kept === undefined) return row
    return { ...row, write: kept.write, read: kept.read.kind === 'reading' ? kept.read : row.read }
  })
  return finished(state, { kind: 'read', rows, partial }, running.stale)
}

type ReadList = Extract<List, { kind: 'read' }>

function listAnswered(state: State, token: number, answer: ListAnswer): Step {
  const list = state.list
  if (list.kind === 'read' && list.refresh?.token === token)
    return refreshAnswered(state, list, list.refresh, answer)
  if (list.kind !== 'reading' || list.token !== token) return same(state)
  if (answer.outcome !== 'succeeded')
    return same({
      ...state,
      list: { kind: 'failed', notice: notice(answer.outcome, READ_SENTENCES) },
    })
  const page = answer.body
  const rows = gather(list.rows, page)
  const partial = list.partial || page.completeness === 'partial'
  if (page.next === null) return finished(state, { kind: 'read', rows, partial }, list.stale)
  return {
    state: { ...state, list: { ...list, rows, partial } },
    effects: [{ kind: 'list', token, after: page.next }],
  }
}

const CONFIRMING: Notice = { kind: 'unknown', text: '结果未知，正在确认。' }
const SECRET_UNCONFIRMED: Notice = {
  kind: 'unknown',
  text: '结果未知：输入的内容没有保留，不能重发。已重新读取这一项，请看上面的状态；没有生效就重新输入。',
}
const SECRET_UNKNOWN: Notice = {
  kind: 'unknown',
  text: '结果未知：没有收到可信的答复。输入的内容没有保留，不能重发，请重新读取这一项来确认。',
}
const STILL_UNKNOWN: Notice = {
  kind: 'unknown',
  text: '结果仍未知：这次确认没有说出原来那次写没写。',
}

function rowOf(state: State, key: string) {
  const list = state.list
  if (list.kind !== 'read') return undefined
  const row = list.rows.find(candidate => candidate.key === key)
  if (row === undefined) return undefined
  const put = (next: Row, effects: readonly Effect[] = [], issued = state.issued): Step => ({
    state: {
      issued,
      list: {
        ...list,
        rows: list.rows.map(candidate => (candidate.key === key ? next : candidate)),
      },
    },
    effects,
  })
  // The items of one asset share its revision: a write that lands or meets a conflict makes every
  // idle item of the same owner stale, so each is read again with the written one.
  const reread = (write: Write): Step => {
    const owner = JSON.stringify(row.view.owner)
    let token = state.issued
    const effects: Effect[] = []
    const rows = list.rows.map((candidate): Row => {
      const written = candidate.key === key
      const sibling =
        JSON.stringify(candidate.view.owner) === owner &&
        candidate.read.kind === 'read' &&
        idle(candidate)
      if (!written && !sibling) return candidate
      token += 1
      effects.push({
        kind: 'describe',
        key: candidate.key,
        token,
        target: targetOf(candidate.view),
      })
      return {
        ...candidate,
        read: { kind: 'reading' as const, token },
        ...(written ? { write } : {}),
      }
    })
    return { state: { issued: token, list: { ...list, rows } }, effects }
  }
  const recognize = (sent: Sent): Step =>
    put({ ...row, write: { kind: 'unknown', sent, confirming: true, notice: CONFIRMING } }, [
      { kind: 'write', key, target: targetOf(row.view), sent },
    ])
  return { row, put, reread, recognize }
}

const idle = (row: Row): boolean =>
  row.read.kind === 'read' && row.write.kind !== 'submitting' && row.write.kind !== 'unknown'

function startWrite(
  state: State,
  key: string,
  operation: string,
  request: WriteRequest,
  secret?: string,
): Step {
  const found = rowOf(state, key)
  if (found === undefined || !idle(found.row)) return same(state)
  const { row, put } = found
  const sent: Sent = { operation, expectedRevision: row.view.revision, request }
  const effect: Effect = { kind: 'write', key, target: targetOf(row.view), sent }
  return put({ ...row, write: { kind: 'submitting', sent } }, [
    secret === undefined ? effect : { ...effect, secret },
  ])
}

function writeAnswered(state: State, key: string, operation: string, answer: WriteAnswer): Step {
  const found = rowOf(state, key)
  if (found === undefined) return same(state)
  const { row, put, reread, recognize } = found
  const write = row.write
  const inFlight = write.kind === 'submitting' || (write.kind === 'unknown' && write.confirming)
  if (!inFlight || write.sent.operation !== operation) return same(state)
  const stillUnknown = (): Step =>
    put({
      ...row,
      write: { kind: 'unknown', sent: write.sent, confirming: false, notice: STILL_UNKNOWN },
    })
  const recognizing = write.kind === 'unknown'
  switch (answer.outcome) {
    case 'succeeded':
      return reread({ kind: 'succeeded', change: 'written' })
    case 'no-change':
      return put({ ...row, write: { kind: 'succeeded', change: 'no-change' } })
    case 'conflict':
      return reread({ kind: 'refused', notice: notice('conflict', SENTENCES) })
    case 'not-writable':
      return put({
        ...row,
        write: {
          kind: 'refused',
          notice: { kind: 'refused', text: NOT_WRITABLE[answer.body.reason] },
        },
      })
    case 'invalid':
    case 'not-visible':
      return put({ ...row, write: { kind: 'refused', notice: notice(answer.outcome, SENTENCES) } })
    case 'denied':
    case 'basis-unavailable':
    case 'protocol-rejected':
    case 'unavailable':
      if (recognizing) return stillUnknown()
      return put({ ...row, write: { kind: 'refused', notice: notice(answer.outcome, SENTENCES) } })
    case 'unknown':
    case 'uncertain':
      if (write.sent.request.kind === 'set-secret')
        return put({
          ...row,
          write: { kind: 'unknown', sent: write.sent, confirming: false, notice: SECRET_UNKNOWN },
        })
      return recognizing ? stillUnknown() : recognize(write.sent)
  }
}

function confirm(state: State, key: string): Step {
  const found = rowOf(state, key)
  if (found === undefined) return same(state)
  const write = found.row.write
  if (write.kind !== 'unknown' || write.confirming) return same(state)
  if (write.sent.request.kind === 'set-secret')
    return found.reread({ ...write, confirming: true, notice: CONFIRMING })
  return found.recognize(write.sent)
}

function describeAnswered(state: State, key: string, token: number, answer: DescribeAnswer): Step {
  const found = rowOf(state, key)
  if (found === undefined) return same(state)
  const { row, put } = found
  if (row.read.kind !== 'reading' || row.read.token !== token) return same(state)
  if (answer.outcome === 'succeeded') {
    const write: Write =
      row.write.kind === 'unknown' ? { kind: 'unconfirmed', notice: SECRET_UNCONFIRMED } : row.write
    return put({ ...row, view: answer.body.item, read: { kind: 'read' }, write })
  }
  return put({ ...row, read: { kind: 'failed', notice: notice(answer.outcome, READ_SENTENCES) } })
}

function retryRow(state: State, key: string): Step {
  const found = rowOf(state, key)
  if (found === undefined || found.row.read.kind !== 'failed') return same(state)
  return found.reread(found.row.write)
}

export function step(state: State, event: Event): Step {
  switch (event.kind) {
    case 'read-list':
      return state.list.kind === 'unread' || state.list.kind === 'failed'
        ? readList(state)
        : same(state)
    case 'changed':
      return changed(state)
    case 'list-answered':
      return listAnswered(state, event.token, event.answer)
    case 'set':
      return startWrite(state, event.key, event.operation, { kind: 'set', pick: event.pick })
    case 'set-value':
      return startWrite(state, event.key, event.operation, {
        kind: 'set-value',
        value: event.value,
      })
    case 'set-secret':
      return startWrite(state, event.key, event.operation, { kind: 'set-secret' }, event.secret)
    case 'clear':
      return startWrite(state, event.key, event.operation, { kind: 'clear' })
    case 'write-answered':
      return writeAnswered(state, event.key, event.operation, event.answer)
    case 'confirm':
      return confirm(state, event.key)
    case 'describe-answered':
      return describeAnswered(state, event.key, event.token, event.answer)
    case 'retry-row':
      return retryRow(state, event.key)
  }
}
