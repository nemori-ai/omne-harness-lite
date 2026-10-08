import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { ASSEMBLY_MANIFEST_RESOURCES } from '@omne-harness-lite/assembly-manifest/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { createAssemblyManifestStore } from './store.ts'
import { AssemblyManifestStoreService } from './service.ts'

export const assemblyManifestStorePlugin = definePlugin({
  name: 'assembly-manifest-store',
  inject: [STORAGE_SERVICE, ASSEMBLY_MANIFEST_RESOURCES],
  Config: z.object({}).strict(),
  apply(ctx) {
    const store = createAssemblyManifestStore(ctx.storage, ctx.assemblyManifestResources.options)
    new AssemblyManifestStoreService(ctx, store)
  },
})
