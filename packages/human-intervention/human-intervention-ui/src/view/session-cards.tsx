import type { TenantId } from '@omne-harness/public-contract'
import { RetryIcon } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import { sheetOf } from '../model/cards-machine.ts'
import type { CardsHub } from '../model/cards-hub.ts'
import { CardArea } from './card-area.tsx'
import { NoticeLine } from './notice.tsx'
import { useCards, useTenant } from './use-cards.ts'
import { humanInterventionSessionCards } from '../parts.ts'

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
  if (sheet.entries.length === 0 && sheet.closed.length === 0 && failed === null) return null
  return (
    <section
      className="hitl-session-cards"
      role="region"
      aria-label={SESSION_CARDS_LABEL}
      {...humanInterventionSessionCards.props}
    >
      {failed === null ? null : (
        <NoticeLine
          notice={{ kind: failed.kind, text: `这个会话的问题读不出来：${failed.text}` }}
          action={{ label: '重试', icon: RetryIcon, onClick: () => driver.readList() }}
        />
      )}
      <CardArea driver={driver} state={state} group={session} />
    </section>
  )
}
