import type { TenantId } from '@omne-harness/public-contract'
import type { JSX } from 'react'
import type { CardsHub } from '../model/cards-hub.ts'
import { useCards, useTenant } from './use-cards.ts'

export type PendingBadgeProps = Readonly<{ hub: CardsHub; tenant: string }>

const SHOWN_MAX = 99

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
  const count = useCards(hub, tenant).state.entries.length
  if (count === 0) return null
  return <span className="hitl-badge">{count > SHOWN_MAX ? `${SHOWN_MAX}+` : count}</span>
}
