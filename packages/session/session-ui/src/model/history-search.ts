import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { notSent } from './session-driver.ts'

type Client = Pick<ClientOf<SessionProtocol>, 'search-history'>
type Body = Parameters<Client['search-history']>[0]
type Answer = Awaited<ReturnType<Client['search-history']>>
type Page = Extract<Answer, { outcome: 'succeeded' }>['body']
export type SearchHit = Page['hits'][number]
export type SearchIncomplete = NonNullable<Page['incomplete']>

/** What the person asked for: the words or the pattern, and the two switches of the search box. */
export type SearchAsk = Readonly<{
  text: string
  mode: 'words' | 'regex'
  caseSensitive: boolean
  onlyMine: boolean
}>

export type SearchView =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'searching'; ask: SearchAsk; hits: readonly SearchHit[] }>
  | Readonly<{
      kind: 'listed'
      ask: SearchAsk
      hits: readonly SearchHit[]
      next: string | null
      incomplete: SearchIncomplete | null
    }>
  | Readonly<{ kind: 'refused'; ask: SearchAsk; hits: readonly SearchHit[]; text: string }>

/** Words separated by spaces must all be there; a pattern is taken as it is. Null: nothing to ask. */
export function contentOf(ask: SearchAsk): Body['content'] | null {
  const { caseSensitive } = ask
  if (ask.mode === 'regex')
    return ask.text === '' ? null : { kind: 'regex', pattern: ask.text, caseSensitive }
  const all = ask.text.split(/\s+/u).filter(word => word !== '')
  return all.length === 0 ? null : { kind: 'literals', all, caseSensitive }
}

const REASON: Readonly<Record<SearchIncomplete['reason'], string>> = {
  budget: '这次搜索到了上限',
  'tail-budget': '最新的一段还没读完',
  rebuilding: '索引正在建',
}

/** Why a page is not through, in words: an unfinished search is never shown as "nothing found". */
export function incompleteText(incomplete: SearchIncomplete): string {
  const parts = [REASON[incomplete.reason]]
  if (incomplete.behind > 0) parts.push(`还有 ${incomplete.behind} 个会话没读完`)
  if (incomplete.progress !== null)
    parts.push(`索引建到 ${incomplete.progress.indexed}/${incomplete.progress.total}`)
  return `还没搜完：${parts.join('，')}。`
}

const QUERY_REASON: Readonly<Record<string, string>> = {
  'pattern-invalid': '这条正则写得不对。',
  'pattern-too-long': '这条正则太长了。',
  'pattern-too-large': '这条正则太复杂了。',
  'literal-too-long': '要找的词太长了。',
  'too-many-literals': '要找的词太多了，至多 8 个。',
}

export function refusalText(answer: Exclude<Answer, { outcome: 'succeeded' }> | Unsent): string {
  switch (answer.outcome) {
    case 'invalid':
      if (answer.body.field === 'cursor') return '索引换了一份，请重新搜一次。'
      return QUERY_REASON[answer.body.reason] ?? `这次搜索没有被接受：${answer.body.reason}`
    case 'limited':
      return '同时在跑的搜索太多了，稍后再试。'
    case 'denied':
      return '没有权限，或登录已失效。'
    default:
      return '历史暂时搜不了。'
  }
}

type Unsent = Readonly<{ outcome: 'unavailable' }>
const IDLE: SearchView = { kind: 'idle' }
type Entry = { view: SearchView; listeners: Set<() => void>; asked: number }

// Session is the authority: the store holds what it answered last, for the ask it was given.
export class HistorySearchStore {
  private readonly entries = new Map<string, Entry>()
  private readonly client: Client

  constructor(client: Client) {
    this.client = client
  }

  read(tenant: string): SearchView {
    return this.entries.get(tenant)?.view ?? IDLE
  }

  subscribe(tenant: string, listener: () => void): () => void {
    const entry = this.entryOf(tenant)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  search(tenant: string, ask: SearchAsk): Promise<void> {
    return this.ask(tenant, ask, null, [])
  }

  /** Goes on from where the last page ended; does nothing when there is no way on. */
  more(tenant: string): Promise<void> {
    const shown = this.read(tenant)
    if (shown.kind !== 'listed' || shown.next === null) return Promise.resolve()
    return this.ask(tenant, shown.ask, shown.next, shown.hits)
  }

  private entryOf(tenant: string): Entry {
    const entry = this.entries.get(tenant) ?? {
      view: IDLE,
      listeners: new Set(),
      asked: 0,
    }
    this.entries.set(tenant, entry)
    return entry
  }

  private async ask(
    tenant: string,
    ask: SearchAsk,
    cursor: string | null,
    hits: readonly SearchHit[],
  ): Promise<void> {
    const entry = this.entryOf(tenant)
    const show = (view: SearchView) => {
      entry.view = view
      for (const listener of entry.listeners) listener()
    }
    const owner = readTenantText(tenant)
    const content = contentOf(ask)
    if (content === null) return show(IDLE)
    entry.asked += 1
    const turn = entry.asked
    show({ kind: 'searching', ask, hits })
    const body = {
      tenant: owner,
      content,
      cursor,
      modelReadable: 'only',
      ...(ask.onlyMine ? { kinds: ['message.user'] } : {}),
    }
    const answer: Answer | Unsent =
      owner === undefined
        ? { outcome: 'unavailable' }
        : await notSent(() => this.client['search-history'](body as Body))
    // A newer ask was made meanwhile: its answer is the one to show.
    if (turn !== entry.asked) return
    if (answer.outcome !== 'succeeded')
      return show({ kind: 'refused', ask, hits, text: refusalText(answer) })
    const { next, incomplete } = answer.body
    show({ kind: 'listed', ask, hits: [...hits, ...answer.body.hits], next, incomplete })
  }
}
