import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import type { AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import { createAssetRegistry } from './registry.ts'
import type { RegistryDependencies } from './types.ts'
import type { AssetRegistryService } from '@omne-harness-lite/asset-registry'
export const ASSET_REGISTRY_SERVICE = 'assetRegistry' as const
const port = <T>() =>
  z.custom<T>(
    value =>
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { read?: unknown }).read === 'function',
  )
export const assetRegistryPlugin = definePlugin({
  name: 'asset-registry',
  inject: ['assemblyManifest', 'clock'],
  Config: z
    .object({
      deployedMeta: z.custom<RegistryDependencies['deployedMeta']>(Array.isArray),
      diagnostic: z.custom<RegistryDependencies['diagnostic']>(
        value => typeof value === 'function',
      ),
      diagnosticFailure: z.custom<RegistryDependencies['diagnosticFailure']>(
        value => typeof value === 'function',
      ),
      monotonicNow: z.custom<RegistryDependencies['monotonicNow']>(
        value => typeof value === 'function',
      ),
      conflictPolicy: z
        .object({ maxRetries: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) })
        .strict(),
      maxInFlight: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      fixedRootInput: port<NonNullable<RegistryDependencies['fixedRootInput']>>().optional(),
      historicalBody: port<NonNullable<RegistryDependencies['historicalBody']>>().optional(),
    })
    .strict(),
  apply(ctx, config) {
    const registry = createAssetRegistry({
      deployedMeta: config.deployedMeta,
      diagnostic: config.diagnostic,
      diagnosticFailure: config.diagnosticFailure,
      monotonicNow: config.monotonicNow,
      conflictPolicy: config.conflictPolicy,
      maxInFlight: config.maxInFlight,
      manifest: ctx.get('assemblyManifest') as AssemblyManifestService,
      clock: ctx.get('clock') as Clock,
      sessionTenancy: {
        async holdingTenant(session) {
          const service = ctx.get('sessionTenancy') as SessionTenancyService | undefined
          return service === undefined ? { failure: 'unavailable' } : service.holdingTenant(session)
        },
      },
      currentInputs: {
        async read(session, tenant) {
          const service = ctx.get('currentEvaluationInputs') as CurrentEvaluationInputs | undefined
          return service === undefined ? { failure: 'unavailable' } : service.read(session, tenant)
        },
      },
      ...(config.fixedRootInput === undefined ? {} : { fixedRootInput: config.fixedRootInput }),
      ...(config.historicalBody === undefined ? {} : { historicalBody: config.historicalBody }),
    })
    ctx.effect(() => () => registry.close())
    const { fill, reload, refreshAvailability, lookup, list, markFailed, onAssetChange } = registry
    ctx.provide(
      ASSET_REGISTRY_SERVICE,
      Object.freeze({
        fill,
        reload,
        refreshAvailability,
        lookup,
        list,
        markFailed,
        onAssetChange,
      }) satisfies AssetRegistryService,
    )
  },
})
