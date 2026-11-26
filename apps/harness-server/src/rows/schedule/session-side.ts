import type { Context } from '@deepseek-ai/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScheduleSessionDefaults } from '@omne-harness/schedule-contract'

type ForNew = NonNullable<ScheduleSessionDefaults['forNew']>

/** What the row that knows Session mounts for the entrances of schedules: read at each call, absent while that row is not started. */
export type ScheduleSessionSide = {
  /** What a new session takes from the session a tool call is in. */
  ofSession: ((tenant: TenantId, session: string | null) => Promise<ForNew | undefined>) | null
  /** What a new session takes from a definition the release defaults to, for a person. */
  ofDefinition: ((tenant: string, definition: string) => Promise<ForNew | undefined>) | null
}

const sides = new WeakMap<Context, ScheduleSessionSide>()

export function scheduleSessionSide(ctx: Context): ScheduleSessionSide {
  const found = sides.get(ctx.root)
  if (found !== undefined) return found
  const created: ScheduleSessionSide = { ofSession: null, ofDefinition: null }
  sides.set(ctx.root, created)
  return created
}
