import {
  Ago,
  Button,
  Checkbox,
  Disclosure,
  EmptyState,
  GlideMenu,
  InlineNotice,
  Input,
  LoadingState,
  PageColumn,
  PageHeader,
  Segmented,
  useAgeClock,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useState, useSyncExternalStore } from 'react'
import {
  incompleteText,
  indexText,
  type HistorySearchStore,
  type SearchAsk,
  type SearchHit,
  type SearchIncomplete,
} from '../model/history-search.ts'
import { sessionName, shownBy } from '../model/session-list.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { useSession } from './use-session.ts'
import type { SessionDriver } from '../model/session-driver.ts'

type Props = Readonly<{
  store: HistorySearchStore
  tenant: string
  /** The name a session goes by in the list, when the list knows it. */
  nameOf: (session: string) => string | null
  onOpen: (hit: SearchHit) => void
}>

const KIND: Readonly<Record<SearchHit['kind'], string>> = {
  'message.user': '我',
  'message.assistant': 'agent',
  'message.tool': '工具结果',
  'message.system_reminder': '系统提醒',
  'message.tool_internal': '内部工具消息',
  'message.compaction': '压缩摘要',
}
const MODES = [
  { value: 'words', label: '词' },
  { value: 'regex', label: '正则' },
] as const

function HitRow({
  hit,
  name,
  now,
  onOpen,
}: {
  hit: SearchHit
  name: string | null
  now: number
  onOpen: () => void
}) {
  const { before, match, after } = hit.snippet
  return (
    <li>
      <button
        type="button"
        className="omne-search-hit"
        data-glide-row=""
        data-control="row"
        onClick={onOpen}
      >
        <span className="omne-search-hit-meta">
          {KIND[hit.kind]} · {name ?? hit.session.slice(0, 8)}
          {hit.at === null ? null : (
            <>
              {' · '}
              <Ago at={encodeInstant(hit.at)} now={now} />
            </>
          )}
        </span>
        <span className="omne-search-hit-text">
          {before}
          <mark>{match}</mark>
          {after}
        </span>
      </button>
    </li>
  )
}

/** The end of a page: a page not through says why, never "nothing found". */
function ListedEnd({
  incomplete,
  found,
  more,
}: {
  incomplete: SearchIncomplete | null
  found: boolean
  more: (() => void) | null
}) {
  if (incomplete === null)
    return (
      <>
        {found ? null : <EmptyState title="没有找到。" hint="可以换几个词，或改用正则。" />}
        {more === null ? null : (
          <Button variant="ghost" size="compact" className="omne-search-more" onClick={more}>
            更多
          </Button>
        )}
      </>
    )
  const index = indexText(incomplete)
  return (
    <div className="omne-search-end">
      <p className="omne-search-note">{incompleteText(incomplete)}</p>
      {index === null ? null : (
        <Disclosure label="详情" className="omne-search-detail">
          {index}
        </Disclosure>
      )}
      {more === null ? null : (
        <Button variant="ghost" size="compact" onClick={more}>
          接着搜
        </Button>
      )}
    </div>
  )
}

/** The search over the history of every session: what was said, newest first. */
export function HistorySearchPage({ store, tenant, nameOf, onOpen }: Props) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, listener),
    [store, tenant],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant))
  const [ask, setAsk] = useState<SearchAsk>({
    text: '',
    mode: 'words',
    caseSensitive: false,
    onlyMine: false,
  })
  // Each change builds on the form as it is now: two of them may come before the next render.
  const change = (part: Partial<SearchAsk>) => setAsk(current => ({ ...current, ...part }))
  const hits = view.kind === 'idle' ? [] : view.hits
  const now = useAgeClock(hits.length > 0)
  const listed = view.kind === 'listed' ? view : null
  const more = listed !== null && listed.next !== null ? () => void store.more(tenant) : null
  return (
    <PageColumn className="omne-search">
      <PageHeader title="搜索" />
      <form
        className="omne-search-form"
        onSubmit={event => {
          event.preventDefault()
          void store.search(tenant, ask)
        }}
      >
        <div className="omne-search-query">
          <Input
            className="h-(--omne-control-height-large)"
            aria-label="要找的词或正则"
            placeholder={ask.mode === 'regex' ? '一条正则' : '一个或几个词，用空格分开'}
            enterKeyHint="search"
            value={ask.text}
            maxLength={512}
            onChange={event => change({ text: event.target.value })}
          />
          <Segmented
            label="按词还是按正则"
            options={MODES}
            value={ask.mode}
            onValueChange={mode => change({ mode })}
          />
        </div>
        <div className="omne-search-options">
          <label className="omne-search-option">
            <Checkbox
              checked={ask.onlyMine}
              onCheckedChange={checked => change({ onlyMine: checked === true })}
            />
            只看我说的
          </label>
          <label className="omne-search-option">
            <Checkbox
              checked={ask.caseSensitive}
              onCheckedChange={checked => change({ caseSensitive: checked === true })}
            />
            区分大小写
          </label>
        </div>
        {view.kind === 'refused' ? <InlineNotice tone="neutral">{view.text}</InlineNotice> : null}
      </form>
      {view.kind === 'searching' ? <LoadingState label="正在搜……" /> : null}
      {hits.length === 0 ? null : (
        <GlideMenu>
          <ul className="omne-search-hits">
            {hits.map(hit => (
              <HitRow
                key={`${hit.session}#${hit.position}`}
                hit={hit}
                name={nameOf(hit.session)}
                now={now}
                onOpen={() => onOpen(hit)}
              />
            ))}
          </ul>
        </GlideMenu>
      )}
      {listed === null ? null : (
        <ListedEnd incomplete={listed.incomplete} found={hits.length > 0} more={more} />
      )}
    </PageColumn>
  )
}

type HostProps = Readonly<{
  store: HistorySearchStore
  workspaces: SessionWorkspaces
  scope: string | undefined
  /** Called after the session of a hit was opened, with the entry to show in it. */
  onShow: (session: string, entry: string) => void
}>

function Hosted({
  driver,
  store,
  tenant,
  onShow,
}: HostProps & { driver: SessionDriver; tenant: string }) {
  const { list } = useSyncExternalStore(driver.subscribe, driver.getState)
  const listed = shownBy(list)?.sessions ?? []
  const nameOf = (session: string) => {
    const item = listed.find(known => known.session === session)
    return item === undefined ? null : sessionName(item)
  }
  return (
    <HistorySearchPage
      store={store}
      tenant={tenant}
      nameOf={nameOf}
      onOpen={hit => {
        driver.openSession(hit.session)
        onShow(hit.session, hit.position)
      }}
    />
  )
}

/** The search page as the shell mounts it: it opens the session of a hit through the workspace. */
export function HistorySearch(props: HostProps) {
  const handle = useSession(props.workspaces, props.scope)
  if (handle.kind !== 'ready' || props.scope === undefined) return <div className="omne-search" />
  return <Hosted {...props} driver={handle.driver} tenant={props.scope} />
}
