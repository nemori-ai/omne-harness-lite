import type { TenantId } from '@omne-harness/public-contract'
import { CountPill } from '@omne-harness/ui-kit'
import type { JSX } from 'react'
import type { InboxHub } from '../model/inbox-hub.ts'
import { openCount } from '../model/inbox-machine.ts'
import { useInbox, useTenant } from './use-inbox.ts'

export type UnresolvedBadgeProps = Readonly<{ hub: InboxHub; tenant: string }>

/** How many notifications are unresolved, beside the title of the page: a neutral count, none of them waits on an answer. */
export function UnresolvedBadge(props: UnresolvedBadgeProps): JSX.Element | null {
  const tenant = useTenant(props.tenant)
  if (tenant === undefined) return null
  return <Count hub={props.hub} tenant={tenant} />
}

function Count({ hub, tenant }: { readonly hub: InboxHub; readonly tenant: TenantId }) {
  const count = openCount(useInbox(hub, tenant).state)
  if (count === 0) return null
  return <CountPill count={count} tone="neutral" label={`${count} 条未了结的通知`} />
}
