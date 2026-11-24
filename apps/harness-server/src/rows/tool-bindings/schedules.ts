import type { Context } from '@deepseek-ai/cordis'
import { ScheduleCallContextSchema, ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import {
  scheduleCommandsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import {
  attachScheduleReads,
  attachSchedules,
  bindScheduleReads,
  bindSchedules,
} from '@omne-harness/schedule-tools'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { readSystemInstant } from '../../entry/session-clock.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'
import { holdLiveCall } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

function now() {
  const instant = readSystemInstant()
  if (!instant.ok) throw new Error('schedules clock unavailable')
  return ScheduleInstantSchema.parse(instant.text)
}

/** While a release card asks what a Schedules call would do: only the reads, under the description's
 * signal. There is no call yet, so nothing that needs one is reachable. */
export function attachReleaseScheduleReads(
  ctx: Context,
  input: Readonly<{ principal: unknown; tenant: TenantId; name: string; signal: AbortSignal }>,
): () => void {
  if (input.name !== 'Schedules') return () => {}
  const tenant = tenantCodec.encode(input.tenant)
  const reads = bindScheduleReads({
    tenant: tenant.ok ? tenant.value : '',
    queries: () => ctx.get(scheduleQueriesKey),
    now,
    async context() {
      const caller = await domainCallerOf(
        toolRuntimeHolder(ctx).verifier(),
        input.principal,
        input.tenant,
      )
      if (caller === undefined) return undefined
      return ScheduleCallContextSchema.parse({
        principalRef: caller.principalRef,
        owner: { kind: 'tenant', tenantId: caller.tenantId, ownerId: caller.ownerId },
        actor: { kind: 'agent', actorRef: caller.actorRef },
        authContextRef: 'tool/Schedules',
        requestId: 'release-detail',
        originatingSessionRef: caller.session,
      })
    },
  })
  return attachScheduleReads(input.signal, reads)
}

/** Attaches the schedule services per call with the session agent's context; the call's access stays
 * registered while its scope is open, so the schedule authority can name the session and the call. */
export function bindReleaseSchedules(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
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
  return holdLiveCall(ctx, parent, attachSchedules(scope, schedules))
}
