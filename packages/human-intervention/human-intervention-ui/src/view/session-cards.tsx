import type { TenantId } from '@omne-harness/public-contract'
import type { JSX } from 'react'
import { sheetOf } from '../model/cards-machine.ts'
import type { CardsHub } from '../model/cards-hub.ts'
import { CardArea } from './card-area.tsx'
import { NoticeLine } from './notice.tsx'
import { useCards, useTenant } from './use-cards.ts'

export type SessionCardsProps = Readonly<{
  hub: CardsHub
  tenant: string
  session: string
}>

export const SESSION_CARDS_LABEL = '这个会话待答的问题'

export function SessionCards(props: SessionCardsProps): JSX.Element | null {
  const tenant = useTenant(props.tenant)
  if (tenant === undefined) return null
  return <Cards hub={props.hub} tenant={tenant} session={props.session} />
}

function Cards({
  hub,
  tenant,
  session,
}: {
  readonly hub: CardsHub
  readonly tenant: TenantId
  readonly session: string
}): JSX.Element | null {
  const { driver, state } = useCards(hub, tenant)
  const sheet = sheetOf(state, session)
  const failed = state.read.kind === 'failed' ? state.read.notice : null
  const waiting = sheet.entries.length
  if (waiting === 0 && sheet.closed.length === 0 && failed === null) return null
  return (
    <section className="hitl-session-cards" role="region" aria-label={SESSION_CARDS_LABEL}>
      {failed === null ? null : (
        <NoticeLine
          notice={{ kind: failed.kind, text: `这个会话的问题读不出来：${failed.text}` }}
          action={{ label: '重试', onClick: () => driver.readList() }}
        />
      )}
      {waiting === 0 ? null : (
        <p className="hitl-wait-hint" role="status">
          {`Agent 在等你回答 ${waiting} 个问题。在这里发的消息会排队，不算回答。`}
        </p>
      )}
      <CardArea driver={driver} state={state} group={session} />
    </section>
  )
}
