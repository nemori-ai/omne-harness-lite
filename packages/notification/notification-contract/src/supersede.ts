import type { NotificationRecord } from './model.ts'
import { sameIdentity, type EventFacts, type SendIdentity } from './values.ts'

/**
 * The earlier notifications an incoming event replaces. `box` holds one recipient's
 * notifications from the same source. A resolved notification is replaced as well:
 * otherwise restoring it would leave two live notifications under one key.
 */
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
