import type { Context } from '@deepseek-ai/cordis'
import { ScheduleCallContextSchema, ScheduleInstantSchema } from '@omne-harness/schedule-contract'
import {
  scheduleCommandsKey,
  scheduleJobsKey,
  scheduleQueriesKey,
} from '@omne-harness/schedule-cordis-contract/cordis'
import {
  attachJobs,
  attachScheduleReads,
  attachSchedules,
  bindJobs,
  bindScheduleReads,
  bindSchedules,
} from '@omne-harness/schedule-tools'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { instantTextOf } from '../../entry/time.ts'
import { scheduleSessionSide } from '../schedule/session-side.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'
import { holdLiveCall } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

const nowOf = (ctx: Context) => () => ScheduleInstantSchema.parse(instantTextOf(ctx, 'Schedules'))

/** While a release card asks what a Schedules call would do: only the reads, under the description's
 * signal. There is no call yet, so nothing that needs one is reachable. */
export function attachReleaseScheduleReads(
  ctx: Context,
  input: Readonly<{ principal: unknown; tenant: TenantId; name: string; signal: AbortSignal }>,
): () => void {
  if (input.name !== 'Schedules') return () => {}
  const tenant = tenantCodec.encode(input.tenant)
  const caller = () =>
    domainCallerOf(toolRuntimeHolder(ctx).verifier(), input.principal, input.tenant)
  const reads = bindScheduleReads({
    tenant: tenant.ok ? tenant.value : '',
    queries: () => ctx.get(scheduleQueriesKey),
    now: nowOf(ctx),
    newSessionDefaults: async () =>
      scheduleSessionSide(ctx).ofSession?.(input.tenant, (await caller())?.session ?? null),
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

/** The session agent's context of one call, for Schedules and Jobs alike. */
function agentContext(ctx: Context, parent: Parent, tool: string) {
  return async () => {
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
      authContextRef: `tool/${tool}`,
      requestId: parent.call,
      originatingSessionRef: caller.session,
    })
  }
}

function newSessionDefaults(ctx: Context, parent: Parent) {
  return async () => {
    const caller = await domainCallerOf(
      toolRuntimeHolder(ctx).verifier(),
      parent.principal,
      parent.tenant,
    )
    return scheduleSessionSide(ctx).ofSession?.(parent.tenant, caller?.session ?? null)
  }
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
    now: nowOf(ctx),
    context: agentContext(ctx, parent, 'Schedules'),
    newSessionDefaults: newSessionDefaults(ctx, parent),
  })
  return holdLiveCall(ctx, parent, attachSchedules(scope, schedules))
}

export function bindReleaseJobs(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const jobs = bindJobs({
    tenant: tenant.ok ? tenant.value : '',
    call: parent.call,
    jobs: () => ctx.get(scheduleJobsKey),
    queries: () => ctx.get(scheduleQueriesKey),
    now: nowOf(ctx),
    context: agentContext(ctx, parent, 'Jobs'),
    newSessionDefaults: newSessionDefaults(ctx, parent),
  })
  return holdLiveCall(ctx, parent, attachJobs(scope, jobs))
}
