import { Button, Checkbox, Input, Segmented, StatusPill } from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useCallback, useState, useSyncExternalStore } from 'react'
import {
  incompleteText,
  type HistorySearchStore,
  type SearchAsk,
  type SearchHit,
} from '../model/history-search.ts'
import { sessionName, shownBy } from '../model/session-list.ts'
import type { SessionWorkspaces } from '../model/session-workspaces.ts'
import { formatMoment } from './moment.ts'
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
  onOpen,
}: {
  hit: SearchHit
  name: string | null
  onOpen: () => void
}) {
  const { before, match, after } = hit.snippet
  return (
    <li className="omne-search-hit">
      <button type="button" className="omne-search-hit-open" onClick={onOpen}>
        <span className="omne-search-hit-meta">
          <StatusPill tone="neutral">{KIND[hit.kind]}</StatusPill>
          <span className="omne-search-hit-session">{name ?? hit.session.slice(0, 8)}</span>
          {hit.at === null ? null : (
            <time dateTime={encodeInstant(hit.at)}>{formatMoment(hit.at)}</time>
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
  return (
    <section className="omne-search" aria-label="搜历史">
      <form
        className="omne-search-form"
        onSubmit={event => {
          event.preventDefault()
          void store.search(tenant, ask)
        }}
      >
        <Input
          aria-label="要找的词或正则"
          placeholder={ask.mode === 'regex' ? '一条正则' : '一个或几个词，用空格分开'}
          value={ask.text}
          maxLength={512}
          onChange={event => change({ text: event.target.value })}
        />
        <Button type="submit" size="compact" disabled={view.kind === 'searching'}>
          搜
        </Button>
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
      </form>
      {view.kind === 'refused' ? (
        <p className="omne-search-note" role="alert">
          {view.text}
        </p>
      ) : null}
      {view.kind === 'searching' ? <p className="omne-search-note">正在搜……</p> : null}
      <ul className="omne-search-hits">
        {hits.map(hit => (
          <HitRow
            key={`${hit.session}#${hit.position}`}
            hit={hit}
            name={nameOf(hit.session)}
            onOpen={() => onOpen(hit)}
          />
        ))}
      </ul>
      {view.kind === 'listed' && view.incomplete !== null ? (
        <p className="omne-search-note" role="status">
          {incompleteText(view.incomplete)}
        </p>
      ) : null}
      {view.kind === 'listed' && view.incomplete === null && hits.length === 0 ? (
        <p className="omne-search-note">没有找到。</p>
      ) : null}
      {view.kind === 'listed' && view.next !== null ? (
        <Button variant="ghost" size="compact" onClick={() => void store.more(tenant)}>
          {view.incomplete === null ? '更多' : '接着搜'}
        </Button>
      ) : null}
    </section>
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
