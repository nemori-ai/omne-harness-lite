import type { TenantId } from '@omne-harness/public-contract'
import { CountPill } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { CardsHub } from '../model/cards-hub.ts'
import { awaitingCount } from '../model/cards-machine.ts'
import { useCards, useTenant } from './use-cards.ts'

export type PendingBadgeProps = Readonly<{ hub: CardsHub; tenant: string }>

export function PendingBadge(props: PendingBadgeProps): JSX.Element | null {
  const tenant = useTenant(props.tenant)
  if (tenant === undefined) return null
  return <Count hub={props.hub} tenant={tenant} />
}

function Count({
  hub,
  tenant,
}: {
  readonly hub: CardsHub
  readonly tenant: TenantId
}): JSX.Element | null {
  const count = awaitingCount(useCards(hub, tenant).state)
  if (count === 0) return null
  return <CountPill count={count} />
}
