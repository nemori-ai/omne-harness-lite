import type { DispatchSessions } from '@omne-harness/dispatch'
import { createCreating } from './creating.ts'
import { createFollowing } from './following.ts'
import type { SessionCalls } from './ports.ts'
import { createSending } from './sending.ts'

export function createDispatchSessions(calls: SessionCalls): DispatchSessions {
  return { ...createCreating(calls), ...createFollowing(calls), ...createSending(calls) }
}
