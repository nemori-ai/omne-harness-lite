import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { McpFaces, McpPrincipals } from '@omne-harness/mcp-access'
import { createMcpAccessPlugin } from '@omne-harness/mcp-access/cordis'
import { isMillis } from '@omne-harness/mcp-contract'
import {
  mcpActionDiscoveryKey,
  mcpAdoptionViewKey,
  mcpEndpointStatusKey,
} from '@omne-harness/mcp-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

const positive = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

export const mcpAccessConfig = z.strictObject({
  refresh: z.strictObject({ connectBoundMs: positive.refine(isMillis) }),
})

function mcpPrincipals(ctx: Context): McpPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

// The services of MCP are read at each call; while one is away the answer is basis-unavailable.
function facesOf(ctx: Context): McpFaces | undefined {
  const adoption = ctx.get(mcpAdoptionViewKey, false)
  const status = ctx.get(mcpEndpointStatusKey, false)
  const discovery = ctx.get(mcpActionDiscoveryKey, false)
  if (adoption === undefined || status === undefined || discovery === undefined) return undefined
  return { adoption, status, discovery }
}

const plugin = createMcpAccessPlugin({ principals: mcpPrincipals, faces: facesOf })

/** mcp/v1 in the release: how the MCP endpoints of a tenant stand, and the refresh of one. */
export const mcpAccessRow = defineRow({
  row: 'mcp-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    ...plugin,
    inject: [accessRegistryKey, principalIssuerKey],
    Config: mcpAccessConfig,
  },
})
