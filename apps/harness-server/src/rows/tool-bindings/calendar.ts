import type { Context } from '@deepseek-ai/cordis'
import { calendarCallContextSchema } from '@omne-harness/calendar-contract'
import { calendarCalculatorKey } from '@omne-harness/calendar-cordis-contract/cordis'
import { attachCalendar, bindCalendar } from '@omne-harness/calendar-tools'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

/** Attaches the calendar calculator, read per call, with the context of the session's agent. */
export function bindReleaseCalendar(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const calendar = bindCalendar({
    tenant: tenant.ok ? tenant.value : '',
    requestId: parent.call,
    calculator: () => ctx.get(calendarCalculatorKey),
    async context() {
      const caller = await domainCallerOf(
        toolRuntimeHolder(ctx).verifier(),
        parent.principal,
        parent.tenant,
      )
      if (caller === undefined) return undefined
      return calendarCallContextSchema.parse({
        principalRef: caller.principalRef,
        owner: { kind: 'tenant', tenantId: caller.tenantId, ownerId: caller.ownerId },
        actor: { kind: 'agent', actorRef: caller.actorRef },
        authContextRef: 'tool/Calendar',
        requestId: parent.call,
        originatingSessionRef: caller.session,
      })
    },
  })
  return attachCalendar(scope, calendar)
}
