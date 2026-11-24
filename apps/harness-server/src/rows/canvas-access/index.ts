import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { CanvasPrincipals } from '@omne-harness/canvas-access'
import { createCanvasAccessPlugin } from '@omne-harness/canvas-access/cordis'
import { tenantIdSchema } from '@omne-harness/canvas-contract'
import { canvasChangesKey, canvasKey } from '@omne-harness/canvas-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

/** A login that acts for a tenant is the person the tenant is: the context carries no tool call. */
function principalsOf(ctx: Context): CanvasPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
    contextOf: (principal, tenant) => ({
      tenant: tenantIdSchema.parse(tenant),
      subject: principal,
    }),
  }
}

const plugin = createCanvasAccessPlugin({
  principals: principalsOf,
  face: ctx => ctx.get(canvasKey),
  changes: ctx => ctx.get(canvasChangesKey),
})

export const canvasAccessRow = defineRow({
  row: 'canvas-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey] },
})
