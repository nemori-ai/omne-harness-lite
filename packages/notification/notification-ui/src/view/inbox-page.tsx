import type { TenantId } from '@omne-harness/public-contract'
import {
  Button,
  EmptyState,
  InlineNotice,
  LoadingState,
  PageColumn,
  PageHeader,
  Segmented,
} from '@omne-harness/ui-kit'
import type { JSX, ReactNode } from 'react'
import type { InboxDriver } from '../model/inbox-driver.ts'
import type { InboxHub } from '../model/inbox-hub.ts'
import { keyOf, sectionsOf, type Entry, type Filter, type State } from '../model/inbox-machine.ts'
import { EntryRow } from './entry-row.tsx'
import { useInbox, useTenant } from './use-inbox.ts'

export type InboxPageProps = Readonly<{
  hub: InboxHub
  tenant: string
  /** The sections other domains put into the panel, already laid out by the module. */
  sections?: ReactNode
}>

const FILTERS = [
  { value: 'unresolved', label: '未了结' },
  { value: 'all', label: '全部' },
] as const satisfies readonly { value: Filter; label: string }[]

export function InboxPage(props: InboxPageProps): JSX.Element {
  const tenant = useTenant(props.tenant)
  if (tenant === undefined)
    return (
      <PageColumn className="notification-page">
        <InlineNotice tone="danger" role="alert">
          <p>外壳给的租户读不懂，这一页不能工作。</p>
        </InlineNotice>
      </PageColumn>
    )
  return <Inbox hub={props.hub} tenant={tenant} sections={props.sections} />
}

type InboxProps = Readonly<{ hub: InboxHub; tenant: TenantId; sections: ReactNode }>

function Inbox({ hub, tenant, sections }: InboxProps): JSX.Element {
  const { driver, state } = useInbox(hub, tenant)
  return (
    <PageColumn className="notification-page">
      <PageHeader
        title="通知"
        description="来源发给你的事件。办完或划掉之后不再提醒，随时可以恢复。"
        actions={
          <>
            <Segmented
              label="显示哪些通知"
              value={state.filter}
              options={FILTERS}
              onValueChange={filter => driver.filter(filter)}
            />
            <Button
              variant="outline"
              disabled={state.read.kind === 'reading'}
              onClick={() => driver.refresh()}
            >
              刷新
            </Button>
          </>
        }
      />
      <LiveLine state={state} />
      <Body state={state} driver={driver} />
      {sections}
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

type BodyProps = Readonly<{ state: State; driver: InboxDriver }>

function Section({
  title,
  entries,
  state,
  driver,
}: BodyProps & { title: string; entries: readonly Entry[] }) {
  if (entries.length === 0) return null
  return (
    <section className="notification-section" role="region" aria-label={title}>
      <h3 className="notification-section-title">
        {title}（{entries.length}）
      </h3>
      <ul className="notification-list">
        {entries.map(entry => (
          <EntryRow key={keyOf(entry)} entry={entry} state={state} driver={driver} />
        ))}
      </ul>
    </section>
  )
}

function Body({ state, driver }: BodyProps): JSX.Element {
  const { read } = state
  const { open, settled } = sectionsOf(state)
  const empty = open.length + settled.length === 0
  return (
    <>
      {read.kind === 'failed' && read.reason === 'unavailable' ? (
        <InlineNotice
          tone="caution"
          role="status"
          action={{ label: '重试', onClick: () => driver.refresh() }}
        >
          <p>{empty ? '收件箱现在读不出。' : '收件箱现在读不出，下面是上一次读到的。'}</p>
        </InlineNotice>
      ) : null}
      {read.kind === 'ready' && read.more ? (
        <InlineNotice tone="caution" role="status">
          <p>通知太多，这里没有列全。办完或划掉一些之后再刷新。</p>
        </InlineNotice>
      ) : null}
      <Section title="未了结" entries={open} state={state} driver={driver} />
      <Section title="已了结" entries={settled} state={state} driver={driver} />
      {!empty ? null : read.kind === 'ready' ? (
        <EmptyState title={state.filter === 'all' ? '收件箱是空的' : '没有未了结的通知'} />
      ) : read.kind === 'failed' ? null : (
        <LoadingState label="正在读取……" />
      )}
    </>
  )
}
