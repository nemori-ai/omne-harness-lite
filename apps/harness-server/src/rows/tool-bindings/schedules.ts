import type { Context } from '@deepseek-ai/cordis'
import { ScheduleCallContextSchema, ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import {
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import { attachSchedules, bindSchedules } from '@omne-harness/schedule-tools'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'
import { liveCallKey, liveCalls } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

function now() {
  const instant = readSystemInstant()
  if (!instant.ok) throw new Error('schedules clock unavailable')
  return ScheduleInstantSchema.parse(instant.text)
}

/** Attaches the schedule services per call with the session agent's context; the call's access stays
 * registered while its scope is open, so the consent check can read this call's own card. */
export function bindReleaseSchedules(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const live = liveCalls(ctx)
  const entry = { principal: parent.principal, tenant: parent.tenant, call: parent.call }
  const key = liveCallKey(tenant.ok ? tenant.value : '', parent.call)
  live.set(key, entry)
  const schedules = bindSchedules({
    tenant: tenant.ok ? tenant.value : '',
    call: parent.call,
    commands: () => ctx.get(scheduleCommandsKey),
    queries: () => ctx.get(scheduleQueriesKey),
    now,
    async context() {
      const caller = await domainCallerOf(
        toolRuntimeHolder(ctx).verifier(),
        parent.principal,
        parent.tenant,
      )
      if (caller === undefined) return undefined
      return ScheduleCallContextSchema.parse({
        principalRef: caller.principalRef,
        owner: { kind: 'tenant', tenantId: caller.tenantId, ownerId: caller.ownerId },
        actor: { kind: 'agent', actorRef: caller.actorRef },
        authContextRef: 'tool/Schedules',
        requestId: parent.call,
        originatingSessionRef: caller.session,
      })
    },
  })
  const attached = attachSchedules(scope, schedules)
  return {
    ...attached,
    finish(exit) {
      if (live.get(key) === entry) live.delete(key)
      return attached.finish(exit)
    },
  }
}
