import type { Context } from '@deepseek-ai/cordis'
import { goalsKey } from '@omne-harness/goal-cordis-contract/cordis'
import { attachGoal, bindGoal } from '@omne-harness/goal-tools'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'
import { holdLiveCall } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

/** The agent is the verified session of the call: the goal it reads, proposes for and tracks is that session's. */
export function bindReleaseGoal(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const goal = bindGoal({
    tenant: tenant.ok ? tenant.value : '',
    call: parent.call,
    goals: () => ctx.get(goalsKey),
    async context() {
      const who = await domainCallerOf(
        toolRuntimeHolder(ctx).verifier(),
        parent.principal,
        parent.tenant,
      )
      if (who === undefined) return undefined
      const caller = { tenant: who.tenantId, subject: parent.principal }
      return { caller, session: who.session }
    },
  })
  return holdLiveCall(ctx, parent, attachGoal(scope, goal))
}
