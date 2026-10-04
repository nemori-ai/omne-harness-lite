import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { Storage } from '@omne-harness-lite/storage'
import { createAssemblyManifestStore } from './store.ts'
import type { ManifestOptions, AssemblyManifestService } from './types.ts'
export const ASSEMBLY_MANIFEST_SERVICE = 'assemblyManifest' as const
export const assemblyManifestStorePlugin = definePlugin({
  name: 'assembly-manifest-store',
  inject: [STORAGE_SERVICE],
  Config: z
    .object({
      presenceSource: z
        .custom<NonNullable<ManifestOptions['presenceSource']>>(
          value =>
            value !== null &&
            typeof value === 'object' &&
            typeof (value as { read?: unknown }).read === 'function',
        )
        .optional(),
      diagnostic: z
        .custom<NonNullable<ManifestOptions['diagnostic']>>(value => typeof value === 'function')
        .optional(),
      diagnosticFailure: z
        .custom<NonNullable<ManifestOptions['diagnosticFailure']>>(
          value => typeof value === 'function',
        )
        .optional(),
    })
    .strict(),
  apply(ctx, config) {
    const store = createAssemblyManifestStore(ctx.get(STORAGE_SERVICE) as Storage, {
      ...(config.presenceSource === undefined ? {} : { presenceSource: config.presenceSource }),
      ...(config.diagnostic === undefined ? {} : { diagnostic: config.diagnostic }),
      ...(config.diagnosticFailure === undefined
        ? {}
        : { diagnosticFailure: config.diagnosticFailure }),
    })
    ctx.effect(() => () => store.close())
    const { readHead, append, readHistory, dependencyPresence, readEvaluation, readGiven } = store
    ctx.provide(
      ASSEMBLY_MANIFEST_SERVICE,
      Object.freeze({
        readHead,
        append,
        readHistory,
        dependencyPresence,
        readEvaluation,
        readGiven,
      }) satisfies AssemblyManifestService,
    )
  },
})
