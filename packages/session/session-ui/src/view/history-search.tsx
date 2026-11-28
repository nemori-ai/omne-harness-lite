import {
  Ago,
  Checkbox,
  CloseIcon,
  ConversationIcon,
  DirectorySearch,
  Disclosure,
  EmptyState,
  GlideMenu,
  IconButton,
  InlineNotice,
  ListReadingRow,
  LoadingState,
  PageColumn,
  PageHeader,
  RetryIcon,
  SearchIcon,
  Segmented,
  useAgeClock,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import {
  incompleteText,
  indexText,
  type HistorySearchStore,
  type SearchAsk,
  type SearchHit,
  type SearchView,
} from '../model/history-search.ts'
import { sessionName, shownBy } from '../model/session-list.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { ReadOnEnd } from './read-on-end.tsx'
import { useSession } from './use-session.ts'
import type { SessionDriver } from '../model/session-driver.ts'
import { sessionSearch, sessionSearchHit } from '../parts.ts'

type Listed = Extract<SearchView, { kind: 'listed' }>

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
const CLEAR = '清除搜索'

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
      <ListReadingRow
        {...sessionSearchHit.props}
        mark={<ConversationIcon aria-hidden="true" />}
        title={name ?? hit.session.slice(0, 8)}
        facts={
          <span className="omne-search-snippet">
            {before}
            <mark>{match}</mark>
            {after}
          </span>
        }
        time={
          <>
            {KIND[hit.kind]}
            {hit.at === null ? null : (
              <>
                {' · '}
                <Ago at={encodeInstant(hit.at)} now={now} />
              </>
            )}
          </>
        }
        onSelect={onOpen}
      />
    </li>
  )
}

/** The end of a page: none found says so as a list does, with 清除搜索; one not through says why, then 接着搜. */
function ListedEnd({
  listed,
  more,
  clear,
}: {
  listed: Listed
  more: () => void
  clear: () => void
}) {
  const { incomplete, next } = listed
  if (incomplete === null)
    return (
      <>
        {listed.hits.length > 0 ? null : (
          <EmptyState
            icon={SearchIcon}
            title={`没有匹配「${listed.ask.text.trim()}」的记录。`}
            action={
              <IconButton label={CLEAR} variant="outline" onClick={clear}>
                <CloseIcon aria-hidden="true" />
              </IconButton>
            }
          />
        )}
        <ReadOnEnd page={next === null ? null : listed} read={more} />
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
      {next === null ? null : (
        <IconButton label="接着搜" size="icon-compact" onClick={more}>
          <RetryIcon aria-hidden="true" />
        </IconButton>
      )}
    </div>
  )
}

/** The search over the history of every session, newest first: a list column on the reading measure. */
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
  const form = useRef<HTMLFormElement>(null)
  // Each change builds on the form as it is now: two of them may come before the next render.
  const change = (part: Partial<SearchAsk>) => setAsk(current => ({ ...current, ...part }))
  const write = (text: string) => {
    change({ text })
    if (text === '') void store.search(tenant, { ...ask, text })
  }
  const clear = () => {
    write('')
    form.current?.querySelector('input')?.focus()
  }
  const hits = view.kind === 'idle' ? [] : view.hits
  const now = useAgeClock(hits.length > 0)
  const listed = view.kind === 'listed' ? view : null
  return (
    <PageColumn className="omne-search" {...sessionSearch.props}>
      <PageHeader title="搜索" />
      <div className="omne-search-column">
        <form
          ref={form}
          className="omne-search-form"
          onSubmit={event => {
            event.preventDefault()
            void store.search(tenant, ask)
          }}
        >
          <DirectorySearch
            label={ask.mode === 'regex' ? '一条正则' : '一个或几个词，用空格分开'}
            clearLabel={CLEAR}
            value={ask.text}
            maxLength={512}
            onChange={write}
          />
          <div className="omne-search-ways">
            <Segmented
              label="按词还是按正则"
              options={MODES}
              value={ask.mode}
              onValueChange={mode => change({ mode })}
            />
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
          <ListedEnd listed={listed} more={() => void store.more(tenant)} clear={clear} />
        )}
      </div>
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
