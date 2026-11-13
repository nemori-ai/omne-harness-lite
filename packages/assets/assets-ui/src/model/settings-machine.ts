// The settings interface as a pure state machine: `step(state, event)` gives the next state and the
// effects the driver runs against the protocol client. Every cell of SPEC.md「全化表」is one branch
// here; the tests are named after the rows.
import type { AssetsProtocol, SettingView } from '@omne-harness/assets-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'

type Client = ClientOf<AssetsProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>
export type ListAnswer = Answer<'list-settings'>
export type DescribeAnswer = Answer<'describe-setting'>
export type WriteAnswer = Answer<'set-setting'> | Answer<'clear-setting'>

/** A sentence for a person, and which of the three kinds of trouble it is. */
export type Notice = Readonly<{ kind: 'refused' | 'unavailable' | 'unknown'; text: string }>

/** What a write asks for. A permission item takes a pick; a clear takes nothing. */
export type WriteRequest = Readonly<{ kind: 'set'; pick: string }> | Readonly<{ kind: 'clear' }>

/** One write as it was sent: a recognition resends exactly this. */
export type Sent = Readonly<{ operation: string; expectedRevision: string; request: WriteRequest }>

export type Write =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'submitting'; sent: Sent }>
  | Readonly<{ kind: 'unknown'; sent: Sent; confirming: boolean; notice: Notice }>
  | Readonly<{ kind: 'succeeded'; change: 'written' | 'no-change' }>
  | Readonly<{ kind: 'refused'; notice: Notice }>

export type RowRead =
  | Readonly<{ kind: 'read' }>
  | Readonly<{ kind: 'reading'; token: number }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type Row = Readonly<{ key: string; view: SettingView; read: RowRead; write: Write }>

export type List =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{ kind: 'reading'; token: number; rows: readonly Row[]; partial: boolean }>
  | Readonly<{ kind: 'read'; rows: readonly Row[]; partial: boolean }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type State = Readonly<{
  list: List
  /** The last read token issued: a new read takes the next one, so a stale answer never matches. */
  issued: number
}>

export type Target = Readonly<{ asset: SettingView['asset']; item: string }>

export type Event =
  | Readonly<{ kind: 'read-list' }>
  | Readonly<{ kind: 'list-answered'; token: number; answer: ListAnswer }>
  | Readonly<{ kind: 'set'; key: string; pick: string; operation: string }>
  | Readonly<{ kind: 'clear'; key: string; operation: string }>
  | Readonly<{ kind: 'write-answered'; key: string; operation: string; answer: WriteAnswer }>
  | Readonly<{ kind: 'confirm'; key: string }>
  | Readonly<{ kind: 'describe-answered'; key: string; token: number; answer: DescribeAnswer }>
  | Readonly<{ kind: 'retry-row'; key: string }>

export type Effect =
  | Readonly<{ kind: 'list'; token: number; after: string | null }>
  | Readonly<{ kind: 'describe'; key: string; token: number; target: Target }>
  | Readonly<{ kind: 'write'; key: string; target: Target; sent: Sent }>

export type Step = Readonly<{ state: State; effects: readonly Effect[] }>

export const INITIAL: State = { list: { kind: 'unread' }, issued: 0 }

/** The row key: the asset and the item, which together name one setting. */
export const keyOf = (view: Target): string =>
  JSON.stringify([view.asset.category, view.asset.name, view.item])

const targetOf = (view: SettingView): Target => ({ asset: view.asset, item: view.item })

const same = (state: State): Step => ({ state, effects: [] })

/** Every answer that is neither a success nor an unknown, nor a refusal with its own reason. */
type Refusal = Exclude<
  ListAnswer['outcome'] | DescribeAnswer['outcome'] | WriteAnswer['outcome'],
  'succeeded' | 'no-change' | 'not-writable' | 'unknown'
>
type NotWritable = Extract<WriteAnswer, { outcome: 'not-writable' }>['body']['reason']

// The sentences people read. One place, so every refusal reads the same wherever it shows.
const SENTENCES: Readonly<Record<Refusal, string>> = {
  denied: '没有权限，或登录已失效。',
  'not-visible': '这一项现在看不到了：资产没有持有，或声明里没有这一项。',
  conflict: '这一项在别处改过了，没有写入。已重新读取。',
  invalid: '服务端认为这个值不合这一项的规定，没有写入。',
  'basis-unavailable': '服务端暂时读不出需要的依据，没有写入。稍后再试。',
  'protocol-rejected': '服务端不认这个请求的格式。',
  unavailable: '没有发出去。',
  uncertain: '没有收到可信的答复。',
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

function notice(outcome: Refusal, sentences: Readonly<Record<Refusal, string>>): Notice {
  return {
    kind: outcome === 'unavailable' || outcome === 'uncertain' ? 'unavailable' : 'refused',
    text: sentences[outcome],
  }
}

function readList(state: State): Step {
  const token = state.issued + 1
  return {
    state: { list: { kind: 'reading', token, rows: [], partial: false }, issued: token },
    effects: [{ kind: 'list', token, after: null }],
  }
}

function listAnswered(state: State, token: number, answer: ListAnswer): Step {
  const list = state.list
  if (list.kind !== 'reading' || list.token !== token) return same(state)
  if (answer.outcome !== 'succeeded')
    return same({
      ...state,
      list: { kind: 'failed', notice: notice(answer.outcome, READ_SENTENCES) },
    })
  const page = answer.body
  const known = new Map(list.rows.map(row => [row.key, row]))
  for (const view of page.items) {
    const key = keyOf(view)
    known.set(key, { key, view, read: { kind: 'read' }, write: { kind: 'none' } })
  }
  const rows = [...known.values()]
  const partial = list.partial || page.completeness === 'partial'
  if (page.next === null) return same({ ...state, list: { kind: 'read', rows, partial } })
  return {
    state: { ...state, list: { kind: 'reading', token, rows, partial } },
    effects: [{ kind: 'list', token, after: page.next }],
  }
}

const CONFIRMING: Notice = { kind: 'unknown', text: '结果未知，正在确认。' }
const STILL_UNKNOWN: Notice = {
  kind: 'unknown',
  text: '结果仍未知：这次确认没有说出原来那次写没写。',
}

/**
 * The row `key` of a read list, with the three ways it changes: put a changed row back; reread it
 * under a new token, with the write it keeps; resend the write it holds, under the same operation.
 */
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
  const reread = (write: Write): Step => {
    const token = state.issued + 1
    const target = targetOf(row.view)
    return put(
      { ...row, read: { kind: 'reading', token }, write },
      [{ kind: 'describe', key, token, target }],
      token,
    )
  }
  const recognize = (sent: Sent): Step =>
    put({ ...row, write: { kind: 'unknown', sent, confirming: true, notice: CONFIRMING } }, [
      { kind: 'write', key, target: targetOf(row.view), sent },
    ])
  return { row, put, reread, recognize }
}

/** Idle: read, and the write settled. Only an idle row takes a new write. */
const idle = (row: Row): boolean =>
  row.read.kind === 'read' && row.write.kind !== 'submitting' && row.write.kind !== 'unknown'

function startWrite(state: State, key: string, operation: string, request: WriteRequest): Step {
  const found = rowOf(state, key)
  if (found === undefined || !idle(found.row)) return same(state)
  const { row, put } = found
  const sent: Sent = { operation, expectedRevision: row.view.revision, request }
  return put({ ...row, write: { kind: 'submitting', sent } }, [
    { kind: 'write', key, target: targetOf(row.view), sent },
  ])
}

function writeAnswered(state: State, key: string, operation: string, answer: WriteAnswer): Step {
  const found = rowOf(state, key)
  if (found === undefined) return same(state)
  const { row, put, reread, recognize } = found
  const write = row.write
  const inFlight = write.kind === 'submitting' || (write.kind === 'unknown' && write.confirming)
  if (!inFlight || write.sent.operation !== operation) return same(state)
  // An answer to a recognition that cannot speak for the original write (SPEC.md R7, R8).
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
      return recognizing ? stillUnknown() : recognize(write.sent)
  }
}

function confirm(state: State, key: string): Step {
  const found = rowOf(state, key)
  if (found === undefined) return same(state)
  const write = found.row.write
  if (write.kind !== 'unknown' || write.confirming) return same(state)
  return found.recognize(write.sent)
}

function describeAnswered(state: State, key: string, token: number, answer: DescribeAnswer): Step {
  const found = rowOf(state, key)
  if (found === undefined) return same(state)
  const { row, put } = found
  if (row.read.kind !== 'reading' || row.read.token !== token) return same(state)
  if (answer.outcome === 'succeeded')
    return put({ ...row, view: answer.body.item, read: { kind: 'read' } })
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
    case 'list-answered':
      return listAnswered(state, event.token, event.answer)
    case 'set':
      return startWrite(state, event.key, event.operation, { kind: 'set', pick: event.pick })
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
