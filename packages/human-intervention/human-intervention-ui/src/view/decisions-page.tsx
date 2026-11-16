import type { TenantId } from '@omne-harness/public-contract'
import { Button, EmptyState, LoadingState, PageColumn, PageHeader } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { CardsDriver } from '../model/cards-driver.ts'
import type { CardsHub } from '../model/cards-hub.ts'
import type { Live, State } from '../model/cards-machine.ts'
import { CardView } from './card-view.tsx'
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
      <PageHeader
        title="待你决定"
        description="Agent 提的问题、要你批准的动作"
        actions={
          <Button
            variant="outline"
            disabled={state.read.kind === 'reading'}
            onClick={() => driver.readList()}
          >
            刷新
          </Button>
        }
      />
      {state.last === null ? null : <NoticeLine notice={state.last.notice} />}
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
          kind: 'unavailable',
          text: '更新暂时连不上，列表可能不是最新的，正在重连。',
        }}
      />
    )
  if (live.kind === 'denied')
    return <NoticeLine notice={{ kind: 'refused', text: '没有权限接收更新，或登录已失效。' }} />
  return null
}

function Body({ state, driver }: { readonly state: State; readonly driver: CardsDriver }) {
  const read = state.read
  const entries = state.entries
  return (
    <>
      {read.kind === 'failed' ? (
        <NoticeLine
          notice={read.notice}
          action={{ label: '重试', onClick: () => driver.readList() }}
        />
      ) : null}
      {read.kind === 'read' && read.partial ? (
        <NoticeLine
          notice={{ kind: 'unavailable', text: '列表不全：有的来源暂时读不出，这里没有列全。' }}
        />
      ) : null}
      {entries.length > 0 ? (
        <ul className="hitl-cards">
          {entries.map(entry => (
            <CardView key={entry.key} entry={entry} driver={driver} origin />
          ))}
        </ul>
      ) : read.kind === 'read' ? (
        <EmptyState title="现在没有要你决定的事" />
      ) : read.kind === 'failed' ? null : (
        <LoadingState label="正在读取……" />
      )}
    </>
  )
}
