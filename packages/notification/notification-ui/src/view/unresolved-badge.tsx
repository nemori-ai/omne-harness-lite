import type { TenantId } from '@omne-harness/public-contract'
import type { JSX } from 'react'
import type { InboxHub } from '../model/inbox-hub.ts'
import { openCount } from '../model/inbox-machine.ts'
import { useInbox, useTenant } from './use-inbox.ts'

export type UnresolvedBadgeProps = Readonly<{ hub: InboxHub; tenant: string }>

const SHOWN_MAX = 99

/** How many notifications are unresolved, beside the title of the page. Nothing when there are none. */
export function UnresolvedBadge(props: UnresolvedBadgeProps): JSX.Element | null {
  const tenant = useTenant(props.tenant)
  if (tenant === undefined) return null
  return <Count hub={props.hub} tenant={tenant} />
}

function Count({ hub, tenant }: { readonly hub: InboxHub; readonly tenant: TenantId }) {
  const count = openCount(useInbox(hub, tenant).state)
  if (count === 0) return null
  return (
    <span className="notification-badge" aria-label={`${count} 条未了结的通知`}>
      {count > SHOWN_MAX ? `${SHOWN_MAX}+` : count}
    </span>
  )
}
