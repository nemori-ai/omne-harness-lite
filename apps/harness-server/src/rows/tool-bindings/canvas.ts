import type { Context } from '@deepseek-ai/cordis'
import { tenantIdSchema } from '@omne-harness/canvas-contract'
import { canvasKey } from '@omne-harness/canvas-cordis-contract/cordis'
import { attachCanvas, bindCanvas } from '@omne-harness/canvas-tools'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { FixedToolRequest } from '@omne-harness/tool-contract'
import type { CallAccess, ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { domainCallerOf } from './domain-caller.ts'
import { holdLiveCall } from './live-calls.ts'

type Parent = CallAccess<unknown> & Readonly<{ request: FixedToolRequest }>

/** The context is the verified session of the call. The call stays registered while it runs, so
 * the canvas names that session's agent as the one who moved; the model gives none of it. */
export function bindReleaseCanvas(
  ctx: Context,
  parent: Parent,
  scope: ToolExecutionScope,
): ToolExecutionScope {
  const tenant = tenantCodec.encode(parent.tenant)
  const canvas = bindCanvas({
    tenant: tenant.ok ? tenant.value : '',
    call: parent.call,
    face: () => ctx.get(canvasKey),
    async context() {
      const caller = await domainCallerOf(
        toolRuntimeHolder(ctx).verifier(),
        parent.principal,
        parent.tenant,
      )
      if (caller === undefined) return undefined
      return { tenant: tenantIdSchema.parse(caller.tenantId), subject: parent.principal }
    },
  })
  return holdLiveCall(ctx, parent, attachCanvas(scope, canvas))
}
