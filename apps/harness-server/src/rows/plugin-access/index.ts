import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createPluginReports, type TargetTenantPrincipals } from '@omne-harness/plugin-access'
import { createPluginAccessPlugin } from '@omne-harness/plugin-access/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'
import { createDevDirectorySource } from './dev-directory.ts'

export const pluginAccessConfig = z.strictObject({
  devDirectory: z
    .string()
    .refine(isAbsolute, 'the plugin dev directory is an absolute path')
    .optional(),
})

function principals(ctx: Context): TargetTenantPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

/** plugin/v1 for clients. The plugins come from the dev directory the operator names, if any. */
export const pluginAccessRow = defineRow({
  row: 'plugin-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'plugin-access',
    inject: [accessRegistryKey, principalIssuerKey],
    Config: pluginAccessConfig,
    apply(ctx: Context, raw: unknown) {
      const { devDirectory } = pluginAccessConfig.parse(raw)
      const logger = ctx.logger('plugin-access')
      const source = createDevDirectorySource({
        root: devDirectory,
        warn: line => logger.warn(line),
      })
      ctx.effect(() => () => source.close(), 'plugin-access.dev-directory.close')
      const reports = createPluginReports()
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
