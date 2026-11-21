import type { TenantId } from '@omne-harness/public-contract'
import {
  AwaitingIcon,
  EmptyState,
  LoadingState,
  PageColumn,
  PageHeader,
  RetryIcon,
} from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import type { CardsHub } from '../model/cards-hub.ts'
import { groupOf, type Live, type State } from '../model/cards-machine.ts'
import { CardArea } from './card-area.tsx'
import { NoticeLine } from './notice.tsx'
import { useCards, useTenant } from './use-cards.ts'

export type DecisionsPageProps = Readonly<{
  hub: CardsHub
  tenant: string
}>

export function DecisionsPage(props: DecisionsPageProps): JSX.Element {
  const tenant = useTenant(props.tenant)
  if (tenant === undefined)
    return (
      <PageColumn className="hitl-decisions">
        <NoticeLine notice={{ kind: 'refused', text: '外壳给的租户读不懂，这一页不能工作。' }} />
      </PageColumn>
    )
  return <Decisions hub={props.hub} tenant={tenant} />
}

function Decisions({ hub, tenant }: { readonly hub: CardsHub; readonly tenant: TenantId }) {
  const { driver, state } = useCards(hub, tenant)
  return (
    <PageColumn className="hitl-decisions">
      <PageHeader title="待你决定" description="Agent 提的问题、要你批准的动作" />
      <LiveLine live={state.live} />
      <Body state={state} driver={driver} />
    </PageColumn>
  )
}

function LiveLine({ live }: { readonly live: Live }) {
  if (live.kind === 'retrying')
    return (
      <NoticeLine
        notice={{
          kind: 'unknown',
          text: '更新暂时连不上，列表可能不是最新的，正在重连。',
        }}
      />
    )
  if (live.kind === 'denied')
    return <NoticeLine notice={{ kind: 'unknown', text: '没有权限接收更新，或登录已失效。' }} />
  return null
}

const SHOWN_SESSION = 12

function groupTitle(group: string): string {
  if (group === '') return '不属于会话的问题'
  return `会话 ${group.length > SHOWN_SESSION ? `${group.slice(0, SHOWN_SESSION)}…` : group}`
}

function groupsOf(state: State): string[] {
  const order = [...state.entries.map(entry => entry.item), ...state.closed.map(c => c.item)]
  return [...new Set(order.map(groupOf))]
}

function Body({ state, driver }: { readonly state: State; readonly driver: CardsDriver }) {
  const read = state.read
  const groups = groupsOf(state)
  return (
    <>
      {read.kind === 'failed' ? (
        <NoticeLine
          notice={read.notice}
          action={{ label: '重试', icon: RetryIcon, onClick: () => driver.readList() }}
        />
      ) : null}
      {read.kind === 'read' && read.partial ? (
        <NoticeLine
          notice={{ kind: 'unavailable', text: '列表不全：有的来源暂时读不出，这里没有列全。' }}
        />
      ) : null}
      {groups.length > 0 ? (
        <div className="hitl-groups">
          {groups.map(group => (
            <section
              key={group}
              className="hitl-group"
              role="region"
              aria-label={groupTitle(group)}
            >
              <h3 className="hitl-group-title">{groupTitle(group)}</h3>
              <CardArea driver={driver} state={state} group={group} />
            </section>
          ))}
        </div>
      ) : read.kind === 'read' ? (
        <EmptyState icon={AwaitingIcon} title="待答的问题会在这里等你。" />
      ) : read.kind === 'failed' ? null : (
        <LoadingState label="正在读取……" />
      )}
    </>
  )
}
