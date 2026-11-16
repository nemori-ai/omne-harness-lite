import type { TenantId } from '@omne-harness/public-contract'
import type { JSX } from 'react'
import type { CardsHub } from '../model/cards-hub.ts'
import { CardView } from './card-view.tsx'
import { NoticeLine } from './notice.tsx'
import { useCards, useTenant } from './use-cards.ts'

export type SessionCardsProps = Readonly<{
  hub: CardsHub
  tenant: string
  session: string
}>

const TITLE = '这个会话在等你决定'

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
  const entries = state.entries.filter(entry => entry.item.origin.sessionRef === session)
  if (entries.length === 0) return null
  const last = state.last
  return (
    <section className="hitl-session-cards" role="region" aria-label={TITLE}>
      <p className="hitl-session-cards-title">{TITLE}</p>
      {last !== null && last.sessionRef === session ? <NoticeLine notice={last.notice} /> : null}
      <ul className="hitl-cards">
        {entries.map(entry => (
          <CardView key={entry.key} entry={entry} driver={driver} origin={false} />
        ))}
      </ul>
    </section>
  )
}
