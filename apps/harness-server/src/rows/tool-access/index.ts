import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ToolCallFaces, ToolCallPrincipals } from '@omne-harness/tool-access'
import { createToolAccessPlugin } from '@omne-harness/tool-access/cordis'
import { toolRuntimeKey, type ToolRuntimeService } from '@omne-harness/tool-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

export const toolAccessConfig = z.strictObject({})

function toolPrincipals(ctx: Context): ToolCallPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

// Taken at each call: while the Tool runtime is away the reads answer basis-unavailable.
function facesOf(ctx: Context): ToolCallFaces | undefined {
  const runtime = ctx.get(toolRuntimeKey) as ToolRuntimeService<unknown, never> | undefined
  if (runtime === undefined) return undefined
  const { queries, instances, observation } = runtime
  const children = () => toolRuntimeHolder(ctx).bundle?.value.children()
  return { queries, instances, observation, children }
}

const plugin = createToolAccessPlugin({ principals: toolPrincipals, faces: facesOf })

export const toolAccessRow = defineRow({
  row: 'tool-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey], Config: toolAccessConfig },
})
