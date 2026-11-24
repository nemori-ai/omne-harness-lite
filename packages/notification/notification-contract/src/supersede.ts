import type { NotificationRecord } from './model.ts'
import { sameIdentity, type EventFacts, type SendIdentity } from './values.ts'

/** A resolved notification is replaced too: restoring it would leave two live ones under one key. */
export function supersede(
  incoming: SendIdentity,
  event: EventFacts,
  box: readonly NotificationRecord[],
): readonly SendIdentity[] {
  if (event.replaceKey === null) return []
  return box
    .filter(
      entry => entry.replaceKey === event.replaceKey && !sameIdentity(entry.identity, incoming),
    )
    .map(entry => entry.identity)
}
