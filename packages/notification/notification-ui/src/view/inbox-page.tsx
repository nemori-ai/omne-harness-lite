import type { TenantId } from '@omne-harness/public-contract'
import {
  EmptyState,
  GlideMenu,
  InlineNotice,
  LoadingState,
  PageColumn,
  PageHeader,
  RetryIcon,
  Segmented,
} from '@omne-harness/ui-kit'
import type { JSX, ReactNode } from 'react'
import type { InboxDriver } from '../model/inbox-driver.ts'
import type { InboxHub } from '../model/inbox-hub.ts'
import {
  keyOf,
  labelOf,
  sectionsOf,
  type Entry,
  type Filter,
  type State,
} from '../model/inbox-machine.ts'
import { EntryRow, type RowDrawer } from './entry-row.tsx'
import { useInbox, useTenant } from './use-inbox.ts'
import { notificationPage, notificationPageFilter, notificationPageGroup } from '../parts.ts'

const OWN_ROW: RowDrawer = (_entry, generic) => generic()

export type InboxPageProps = Readonly<{
  hub: InboxHub
  tenant: string
  /** The sections other domains put into the panel, already laid out by the module. */
  sections?: ReactNode
  /** The key of the notification the page was brought up on, such as from a toast. */
  focus?: string
  /** What draws the inside of a row; `generic` is the row the page draws itself. */
  row?: RowDrawer
}>

const FILTERS = [
  { value: 'unresolved', label: '未了结' },
  { value: 'all', label: '全部' },
] as const satisfies readonly { value: Filter; label: string }[]

export function InboxPage(props: InboxPageProps): JSX.Element {
  const tenant = useTenant(props.tenant)
  if (tenant === undefined)
    return (
      <PageColumn className="notification-page" {...notificationPage.props}>
        <InlineNotice tone="danger" role="alert">
          <p>外壳给的租户读不懂，这一页不能工作。</p>
        </InlineNotice>
      </PageColumn>
    )
  return (
    <Inbox
      hub={props.hub}
      tenant={tenant}
      sections={props.sections}
      focus={props.focus}
      row={props.row ?? OWN_ROW}
    />
  )
}

type InboxProps = Readonly<{
  hub: InboxHub
  tenant: TenantId
  sections: ReactNode
  focus: string | undefined
  row: RowDrawer
}>

function Inbox({ hub, tenant, sections, focus, row }: InboxProps): JSX.Element {
  const { driver, state } = useInbox(hub, tenant)
  return (
    <PageColumn className="notification-page" {...notificationPage.props}>
      <PageHeader title="通知" description="来源发给你的事件。" />
      <div className="notification-column">
        <div className="notification-scope" {...notificationPageFilter.props}>
          <Segmented
            label="显示哪些通知"
            value={state.filter}
            options={FILTERS}
            onValueChange={filter => driver.filter(filter)}
          />
        </div>
        <LiveLine state={state} />
        <Body state={state} driver={driver} focus={focus} row={row} />
        {sections}
      </div>
    </PageColumn>
  )
}

function LiveLine({ state }: { readonly state: State }): JSX.Element | null {
  if (state.live.kind === 'retrying')
    return (
      <InlineNotice tone="caution" role="status">
        <p>更新暂时连不上，列表可能不是最新的，正在重连。</p>
      </InlineNotice>
    )
  if (state.live.kind === 'denied')
    return (
      <InlineNotice tone="danger" role="alert">
        <p>没有权限看这个收件箱，或登录已失效。</p>
      </InlineNotice>
    )
  return null
}

type BodyProps = Readonly<{
  state: State
  driver: InboxDriver
  focus: string | undefined
  row: RowDrawer
}>

function Section({
  title,
  entries,
  state,
  driver,
  focus,
  row,
}: BodyProps & { title: string; entries: readonly Entry[] }) {
  if (entries.length === 0) return null
  return (
    <section
      className="notification-section"
      role="region"
      aria-label={title}
      {...notificationPageGroup.props}
    >
      <h3 className="notification-section-title">
        {title}（{entries.length}）
      </h3>
      <GlideMenu>
        <ul className="notification-list">
          {entries.map(entry => (
            <EntryRow
              key={keyOf(entry)}
              entry={entry}
              source={labelOf(state, entry.source)}
              state={state}
              driver={driver}
              focused={keyOf(entry) === focus}
              drawn={row}
            />
          ))}
        </ul>
      </GlideMenu>
    </section>
  )
}

function Body({ state, driver, focus, row }: BodyProps): JSX.Element {
  const { read } = state
  const { open, settled } = sectionsOf(state)
  const empty = open.length + settled.length === 0
  return (
    <>
      {read.kind === 'failed' && read.reason === 'unavailable' ? (
        <InlineNotice
          tone="caution"
          role="status"
          action={{ label: '重试', icon: RetryIcon, onClick: () => driver.refresh() }}
        >
          <p>{empty ? '收件箱现在读不出。' : '收件箱现在读不出，下面是上一次读到的。'}</p>
        </InlineNotice>
      ) : null}
      {read.kind === 'ready' && read.more ? (
        <InlineNotice tone="caution" role="status">
          <p>通知太多，这里没有列全。</p>
        </InlineNotice>
      ) : null}
      <Section
        title="未了结"
        entries={open}
        state={state}
        driver={driver}
        focus={focus}
        row={row}
      />
      <Section
        title="已了结"
        entries={settled}
        state={state}
        driver={driver}
        focus={focus}
        row={row}
      />
      {!empty ? null : read.kind === 'ready' ? (
        <EmptyState title={state.filter === 'all' ? '收件箱是空的' : '没有未了结的通知'} />
      ) : read.kind === 'failed' ? null : (
        <LoadingState label="正在读取……" />
      )}
    </>
  )
}
