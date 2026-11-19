import type { AssetRowView, AssetsProtocol, CreationDetail } from '@omne-harness/assets-protocol'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  NOT_CREATING,
  stepCreation,
  type CreationEffect,
  type CreationEvent,
  type Creating,
} from './creation.ts'
import { COMMON_SENTENCES, refusal, type Notice } from './notices.ts'

type Client = ClientOf<AssetsProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>
export type ListAnswer = Answer<'list-assets'>
export type CategoryAnswer = Answer<'describe-category'>
export type DetailAnswer = Answer<'describe-asset'>
export type ChangeAnswer = Answer<'set-asset-enabled'> | Answer<'remove-asset'>
export type RecallAnswer = Answer<'query-asset-operation'>

export type Described = Extract<DetailAnswer, { outcome: 'succeeded' }>['body']

export type AssetRequest =
  | Readonly<{ kind: 'enable' }>
  | Readonly<{ kind: 'disable' }>
  | Readonly<{ kind: 'remove' }>

export type AssetSent = Readonly<{ operation: string; holding: string; request: AssetRequest }>

export type Action =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'submitting'; sent: AssetSent }>
  | Readonly<{ kind: 'unknown'; sent: AssetSent; confirming: boolean; notice: Notice }>
  | Readonly<{ kind: 'done'; text: string }>
  | Readonly<{ kind: 'refused'; notice: Notice }>

export type Detail =
  | Readonly<{ kind: 'reading'; token: number; shown?: Described; stale: boolean }>
  | Readonly<{ kind: 'read'; asset: Described }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type ListedAssets = Readonly<{ items: readonly AssetRowView[]; partial: boolean }>

export type AssetList =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{
      kind: 'reading'
      token: number
      gathered: readonly AssetRowView[]
      partial: boolean
      /** What the last read found, null before any; `stale`: a change came, one more read follows. */
      shown: ListedAssets | null
      stale: boolean
    }>
  | Readonly<{ kind: 'read'; items: readonly AssetRowView[]; partial: boolean }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type CategoryInfo =
  | Readonly<{ kind: 'unread' }>
  | Readonly<{
      kind: 'read'
      title: string
      summary: string
      hint: string | null
      creation: CreationDetail
    }>
  | Readonly<{ kind: 'failed'; notice: Notice }>

export type AssetsState = Readonly<{
  list: AssetList
  category: CategoryInfo
  details: ReadonlyMap<string, Detail>
  actions: ReadonlyMap<string, Action>
  creating: Creating
  /** The last read token issued: a new read takes the next one, so a stale answer never matches. */
  issued: number
}>

export type AssetsEvent =
  | Readonly<{ kind: 'read-list' }>
  | Readonly<{ kind: 'list-answered'; token: number; answer: ListAnswer }>
  | Readonly<{ kind: 'read-category' }>
  | Readonly<{ kind: 'category-answered'; answer: CategoryAnswer }>
  | Readonly<{ kind: 'open'; name: string }>
  | Readonly<{ kind: 'close'; name: string }>
  | Readonly<{ kind: 'detail-answered'; name: string; token: number; answer: DetailAnswer }>
  | Readonly<{ kind: 'change'; name: string; request: AssetRequest; operation: string }>
  | Readonly<{ kind: 'change-answered'; name: string; operation: string; answer: ChangeAnswer }>
  | Readonly<{ kind: 'confirm'; name: string }>
  | Readonly<{ kind: 'confirm-answered'; name: string; operation: string; answer: RecallAnswer }>
  | Readonly<{ kind: 'changed' }>
  | CreationEvent

export type AssetsEffect =
  | Readonly<{ kind: 'list'; token: number; after: string | null }>
  | Readonly<{ kind: 'category' }>
  | Readonly<{ kind: 'describe'; name: string; token: number }>
  | Readonly<{ kind: 'change'; name: string; sent: AssetSent }>
  | Readonly<{ kind: 'recall'; name: string; sent: AssetSent }>
  | CreationEffect

export type AssetsStep = Readonly<{ state: AssetsState; effects: readonly AssetsEffect[] }>

export const INITIAL_ASSETS: AssetsState = {
  list: { kind: 'unread' },
  category: { kind: 'unread' },
  details: new Map(),
  actions: new Map(),
  creating: NOT_CREATING,
  issued: 0,
}

type Refusal =
  | 'denied'
  | 'basis-unavailable'
  | 'protocol-rejected'
  | 'unavailable'
  | 'uncertain'
  | 'invalid'
  | 'not-found'
  | 'conflict'
  | 'limited'

const SENTENCES: Readonly<Record<Refusal, string>> = {
  ...COMMON_SENTENCES,
  'basis-unavailable': '服务端暂时读不出需要的依据，稍后再试。',
  invalid: '服务端认为这个请求不合规定。',
  'not-found': '这一份已经不在了。',
  conflict: '这一份在别处改过了，没有改动。已重新读取。',
  limited: '服务端现在忙，稍后再试。',
}

const NOT_WRITABLE: Readonly<Record<'official' | 'removed', string>> = {
  official: '这一份是部署装的官方资产，不能停用或移除。',
  removed: '这一份已经移除了。',
}

const DONE: Readonly<Record<AssetRequest['kind'], string>> = {
  enable: '已启用。',
  disable: '已禁用。',
  remove: '已移除。',
}

export const notice = (outcome: string): Notice =>
  refusal(outcome, SENTENCES[outcome as Refusal] ?? `服务端答：${outcome}。`)

const same = (state: AssetsState): AssetsStep => ({ state, effects: [] })

function withEntry<V>(map: ReadonlyMap<string, V>, key: string, value: V | undefined) {
  const next = new Map(map)
  if (value === undefined) next.delete(key)
  else next.set(key, value)
  return next
}

/** What the list shows now: the last read, kept while the next one runs; null before any. */
export function listShown(list: AssetList): ListedAssets | null {
  if (list.kind === 'read') return { items: list.items, partial: list.partial }
  return list.kind === 'reading' ? list.shown : null
}

function readList(state: AssetsState): AssetsStep {
  const token = state.issued + 1
  const shown = listShown(state.list)
  return {
    state: {
      ...state,
      issued: token,
      list: { kind: 'reading', token, gathered: [], partial: false, shown, stale: false },
    },
    effects: [{ kind: 'list', token, after: null }],
  }
}

function listAnswered(state: AssetsState, token: number, answer: ListAnswer): AssetsStep {
  const list = state.list
  if (list.kind !== 'reading' || list.token !== token) return same(state)
  if (answer.outcome !== 'succeeded')
    return same({ ...state, list: { kind: 'failed', notice: notice(answer.outcome) } })
  const gathered = [...list.gathered, ...answer.body.items]
  const partial = list.partial || answer.body.completeness === 'partial'
  if (answer.body.next !== null)
    return {
      state: { ...state, list: { ...list, gathered, partial } },
      effects: [{ kind: 'list', token, after: answer.body.next }],
    }
  const read = { ...state, list: { kind: 'read', items: gathered, partial } } as const
  return list.stale ? readList(read) : same(read)
}

function categoryAnswered(state: AssetsState, answer: CategoryAnswer): AssetsStep {
  if (answer.outcome !== 'succeeded')
    return same({ ...state, category: { kind: 'failed', notice: notice(answer.outcome) } })
  const { title, summary, hint, creation } = answer.body
  return same({ ...state, category: { kind: 'read', title, summary, hint, creation } })
}

function open(state: AssetsState, name: string): AssetsStep {
  const token = state.issued + 1
  const current = state.details.get(name)
  const shown =
    current?.kind === 'read'
      ? current.asset
      : current?.kind === 'reading'
        ? current.shown
        : undefined
  const reading: Detail =
    shown === undefined
      ? { kind: 'reading', token, stale: false }
      : { kind: 'reading', token, shown, stale: false }
  return {
    state: { ...state, issued: token, details: withEntry(state.details, name, reading) },
    effects: [{ kind: 'describe', name, token }],
  }
}

function detailAnswered(
  state: AssetsState,
  name: string,
  token: number,
  answer: DetailAnswer,
): AssetsStep {
  const current = state.details.get(name)
  if (current?.kind !== 'reading' || current.token !== token) return same(state)
  const detail: Detail =
    answer.outcome === 'succeeded'
      ? { kind: 'read', asset: answer.body }
      : answer.outcome === 'not-found'
        ? { kind: 'absent' }
        : { kind: 'failed', notice: notice(answer.outcome) }
  const answered = { ...state, details: withEntry(state.details, name, detail) }
  return current.stale ? open(answered, name) : same(answered)
}

/** After a change the list and open details are read again; a read already running is only marked. */
function reread(state: AssetsState): AssetsStep {
  const list = state.list
  let step: AssetsStep =
    list.kind !== 'reading'
      ? readList(state)
      : same(list.stale ? state : { ...state, list: { ...list, stale: true } })
  for (const [name, detail] of state.details) {
    if (detail.kind === 'reading') {
      if (detail.stale) continue
      const marked = withEntry(step.state.details, name, { ...detail, stale: true })
      step = { state: { ...step.state, details: marked }, effects: step.effects }
      continue
    }
    const opened = open(step.state, name)
    step = { state: opened.state, effects: [...step.effects, ...opened.effects] }
  }
  return step
}

function holdingOf(state: AssetsState, name: string): string | undefined {
  const detail = state.details.get(name)
  if (detail?.kind === 'read') return detail.asset.item.holding
  return listShown(state.list)?.items.find(item => item.name === name)?.holding
}

const busy = (action: Action | undefined): boolean =>
  action?.kind === 'submitting' || action?.kind === 'unknown'

function change(
  state: AssetsState,
  name: string,
  request: AssetRequest,
  operation: string,
): AssetsStep {
  if (busy(state.actions.get(name))) return same(state)
  const holding = holdingOf(state, name)
  if (holding === undefined) return same(state)
  const sent: AssetSent = { operation, holding, request }
  return {
    state: { ...state, actions: withEntry(state.actions, name, { kind: 'submitting', sent }) },
    effects: [{ kind: 'change', name, sent }],
  }
}

/** One answer of a change or of its recall, as the action slot records it. */
function settle(
  state: AssetsState,
  name: string,
  sent: AssetSent,
  outcome: string,
  reason?: string,
): AssetsStep {
  const record = (action: Action | undefined) =>
    ({ ...state, actions: withEntry(state.actions, name, action) }) satisfies AssetsState
  switch (outcome) {
    case 'succeeded':
      return reread(record({ kind: 'done', text: DONE[sent.request.kind] }))
    case 'no-change':
      return reread(record({ kind: 'done', text: '没有变化：已经是这个状态。' }))
    case 'not-writable':
      return same(
        record({
          kind: 'refused',
          notice: {
            kind: 'refused',
            text: reason === 'official' ? NOT_WRITABLE.official : NOT_WRITABLE.removed,
          },
        }),
      )
    case 'unknown':
    case 'uncertain':
      return same(
        record({
          kind: 'unknown',
          sent,
          confirming: false,
          notice: { kind: 'unknown', text: '结果不明：可能已经改了，也可能没有。认回一下再决定。' },
        }),
      )
    case 'conflict':
    case 'not-found':
      return reread(record({ kind: 'refused', notice: notice(outcome) }))
    default:
      return same(record({ kind: 'refused', notice: notice(outcome) }))
  }
}

function changeAnswered(
  state: AssetsState,
  name: string,
  operation: string,
  answer: ChangeAnswer,
): AssetsStep {
  const action = state.actions.get(name)
  if (action?.kind !== 'submitting' || action.sent.operation !== operation) return same(state)
  const reason = answer.outcome === 'not-writable' ? answer.body.reason : undefined
  return settle(state, name, action.sent, answer.outcome, reason)
}

function confirm(state: AssetsState, name: string): AssetsStep {
  const action = state.actions.get(name)
  if (action?.kind !== 'unknown' || action.confirming) return same(state)
  return {
    state: { ...state, actions: withEntry(state.actions, name, { ...action, confirming: true }) },
    effects: [{ kind: 'recall', name, sent: action.sent }],
  }
}

function confirmAnswered(
  state: AssetsState,
  name: string,
  operation: string,
  answer: RecallAnswer,
): AssetsStep {
  const action = state.actions.get(name)
  if (action?.kind !== 'unknown' || !action.confirming || action.sent.operation !== operation)
    return same(state)
  if (answer.outcome === 'not-committed')
    return same({
      ...state,
      actions: withEntry(state.actions, name, {
        kind: 'refused',
        notice: { kind: 'unavailable', text: '上一次没有生效，可以再试一次。' },
      }),
    })
  if (['unavailable', 'uncertain', 'basis-unavailable'].includes(answer.outcome))
    return same({
      ...state,
      actions: withEntry(state.actions, name, {
        ...action,
        confirming: false,
        notice: notice(answer.outcome),
      }),
    })
  const reason = answer.outcome === 'not-writable' ? answer.body.reason : undefined
  return settle(state, name, action.sent, answer.outcome, reason)
}

export function stepAssets(state: AssetsState, event: AssetsEvent): AssetsStep {
  switch (event.kind) {
    case 'read-list':
      return readList(state)
    case 'list-answered':
      return listAnswered(state, event.token, event.answer)
    case 'read-category':
      return { state, effects: [{ kind: 'category' }] }
    case 'category-answered':
      return categoryAnswered(state, event.answer)
    case 'open':
      return open(state, event.name)
    case 'close':
      return same({ ...state, details: withEntry(state.details, event.name, undefined) })
    case 'detail-answered':
      return detailAnswered(state, event.name, event.token, event.answer)
    case 'change':
      return change(state, event.name, event.request, event.operation)
    case 'change-answered':
      return changeAnswered(state, event.name, event.operation, event.answer)
    case 'confirm':
      return confirm(state, event.name)
    case 'confirm-answered':
      return confirmAnswered(state, event.name, event.operation, event.answer)
    case 'changed':
      return reread(state)
    case 'create':
    case 'create-progress':
    case 'create-answered':
    case 'confirm-create':
    case 'confirm-create-answered':
      return creation(state, event)
  }
}

function creation(state: AssetsState, event: CreationEvent): AssetsStep {
  const step = stepCreation(state.creating, event, name => holdingOf(state, name) !== undefined)
  if (step.creating === state.creating) return same(state)
  const next = { ...state, creating: step.creating }
  if (!step.reread) return { state: next, effects: step.effects }
  const reread = readList(next)
  return { state: reread.state, effects: [...step.effects, ...reread.effects] }
}
