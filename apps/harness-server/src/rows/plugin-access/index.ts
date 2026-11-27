import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { assetChangesKey } from '@omne-harness/assets-cordis-contract'
import type { AssetChangesService } from '@omne-harness/assets-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import {
  combineSources,
  createPluginReports,
  type TargetTenantPrincipals,
} from '@omne-harness/plugin-access'
import { createPluginAccessPlugin } from '@omne-harness/plugin-access/cordis'
import { dynamisKey, type DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { PROTOCOL_EXAMPLE, PROTOCOL_GIVES } from './protocol-form.ts'
import { GUEST_FORMS_POINT, type GuestForm } from '@omne-harness/plugin-host-local'
import { guestItem } from '@omne-harness/server-entry'
import { PROTOCOLS } from '@omne-harness/server-entry/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'
import { createDevDirectorySource } from './dev-directory.ts'
import { tenantAssetsKey, type TenantAssetsService } from '../tenant-assets/service.ts'
import { createHeldSource } from './held-source.ts'
import { pluginReportsKey, providePluginReports } from './reports-service.ts'

export const pluginAccessConfig = z.strictObject({
  devDirectory: z
    .string()
    .refine(isAbsolute, 'the plugin dev directory is an absolute path')
    .optional(),
  reportsPerTenant: z.number().int().min(1).max(1024).default(32),
})

/** How a protocol the code of a plugin wrote becomes an item of the point of protocols. */
const protocolGuestForm: GuestForm = (made, context) => guestItem(made, context)

function principals(ctx: Context): TargetTenantPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

/** plugin/v1 for clients. The plugins are those the tenant holds as assets, and those of the dev directory the operator names, if any. */
export const pluginAccessRow = defineRow({
  row: 'plugin-access',
  implementation: 'real',
  manifest: {
    provides: [pluginReportsKey],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'plugin-access',
    inject: [accessRegistryKey, principalIssuerKey],
    Config: pluginAccessConfig,
    apply(ctx: Context, raw: unknown) {
      const { devDirectory, reportsPerTenant } = pluginAccessConfig.parse(raw)
      const logger = ctx.logger('plugin-access')
      const dev = createDevDirectorySource({
        root: devDirectory,
        warn: line => logger.warn(line),
      })
      ctx.effect(() => () => dev.close(), 'plugin-access.dev-directory.close')
      const held = createHeldSource({
        assets: () => ctx.get(tenantAssetsKey) as TenantAssetsService | undefined,
        changes: () => ctx.get(assetChangesKey) as AssetChangesService | undefined,
      })
      ctx.effect(() => () => held.close(), 'plugin-access.held.close')
      const source = combineSources([dev, held])
      const reports = createPluginReports({ perTenant: reportsPerTenant })
      providePluginReports(ctx, reports)
      ctx.inject([dynamisKey], child => {
        const guestForm = {
          point: GUEST_FORMS_POINT,
          key: PROTOCOLS,
          id: '',
          scope: [],
          rank: 0,
          digest: `${PROTOCOLS}@plugin-access`,
          item: { form: protocolGuestForm, gives: PROTOCOL_GIVES, example: PROTOCOL_EXAMPLE },
        }
        ;(child.get(dynamisKey) as DynamisService).put([guestForm])
      })
      ctx.plugin(
        createPluginAccessPlugin({
          principals,
          source: () => source,
          reports: () => reports,
        }),
      )
    },
  },
})
