import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { InterfacePrincipals } from '@omne-harness/interface-access'
import {
  createInterfaceAccessPlugin,
  interfaceInspectionsKey,
} from '@omne-harness/interface-access/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { z } from 'zod'
import { runTimeOf } from '../../entry/time.ts'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

export const interfaceAccessConfig = z.strictObject({
  dueMs: z.number().int().min(1),
  perTenant: z.number().int().min(1),
})

function principalsOf(ctx: Context): InterfacePrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

/** interface/v1 for clients, and the inspections the tool AppView asks through: one ledger, in memory. */
export const interfaceAccessRow = defineRow({
  row: 'interface-access',
  implementation: 'real',
  manifest: {
    provides: [interfaceInspectionsKey],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'interface-access-row',
    inject: [accessRegistryKey, principalIssuerKey],
    Config: interfaceAccessConfig,
    apply(ctx: Context, raw: unknown) {
      const policy = interfaceAccessConfig.parse(raw)
      ctx.plugin(
        createInterfaceAccessPlugin({
          principals: principalsOf(ctx),
          time: runTimeOf(ctx),
          policy,
        }),
      )
    },
  },
})
