import type { Context } from '@deepseek-ai/cordis'
import type { Storage, SnapshotMaintenance } from '@omne-harness-lite/storage'
import type { AssemblyDeclaration } from '@omne-harness-lite/cordis-plugin-tree'
import {
  ASSEMBLY_LIFETIME_SERVICE,
  startAssemblyWork,
} from '@omne-harness-lite/assembly-lifecycle/cordis'
import {
  ENTRY_OPENING_SERVICE,
  ENTRY_MAINTENANCE_SERVICE,
} from '@omne-harness-lite/governance-center-entry/cordis'
import {
  SERVING_EVENT,
  STOPPED_EVENT,
  DEFECT_EVENT,
  LISTENING_EVENT,
} from '@omne-harness-lite/governance-center-entry'
import { STORAGE_SERVICE } from '@omne-harness-lite/storage/cordis'
import { CLOCK_SERVICE } from '@omne-harness-lite/offer-expiry/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { GovernanceCenterOpsConfigSchema, type GovernanceCenterOpsConfig } from './config.ts'
import { createGovernanceCenterOps } from './entry.ts'
import type { GovernanceCenterOpsDependencies } from './dependencies.ts'

function hasMaintenance(
  storage: Storage,
): storage is Storage & { readonly maintenance: SnapshotMaintenance } {
  return 'maintenance' in storage && storage.maintenance !== undefined
}
function dependencies(ctx: Context, isCurrent: () => boolean): GovernanceCenterOpsDependencies {
  return {
    get storage() {
      const storage = ctx.storage
      if (!hasMaintenance(storage)) throw new Error('owned snapshot maintenance is required')
      return storage
    },
    get clock() {
      return ctx.clock
    },
    get opening() {
      return ctx.entryOpening
    },
    get maintenance() {
      return ctx.entryMaintenance
    },
    logger: ctx.logger('governance-center-ops'),
    notifications: {
      listening: () => {
        ctx.emit(LISTENING_EVENT)
      },
      onServing: listener => ctx.on(SERVING_EVENT, listener),
      onStopped: listener => ctx.on(STOPPED_EVENT, listener),
      onDefect: listener => ctx.on(DEFECT_EVENT, listener),
    },
    isCurrent,
  }
}
function describeOpsAssembly(value: unknown): AssemblyDeclaration {
  const config = GovernanceCenterOpsConfigSchema.parse(value)
  return {
    provides: [],
    requires: [STORAGE_SERVICE, CLOCK_SERVICE, ENTRY_OPENING_SERVICE, ENTRY_MAINTENANCE_SERVICE],
    optional: [],
    dynamicProvides: [],
    dynamicRequires: [],
    claims: [
      {
        name: 'tenancy-host/ops',
        version: 1,
        config: {
          socketDirectory: config.socketDirectory,
          deploymentKey: { ...config.deploymentKey },
          deploymentParameters: { ...config.deploymentParameters },
          maintenance: {
            ...config.maintenance,
            migrationNames: [...config.maintenance.migrationNames],
          },
        },
      },
    ],
  }
}
export const governanceCenterOpsPlugin = definePlugin<GovernanceCenterOpsConfig>({
  name: 'governance-center-entry-node-ops',
  inject: [STORAGE_SERVICE, CLOCK_SERVICE, ENTRY_OPENING_SERVICE, ENTRY_MAINTENANCE_SERVICE],
  Config: GovernanceCenterOpsConfigSchema,
  async apply(ctx: Context, config) {
    const work = createGovernanceCenterOps(
      config,
      dependencies(ctx, () => ctx.fiber.uid !== null),
    )
    ctx.effect(() => work.close, 'governance-center-ops socket')
    await work.setup()
  },
})
export const managedGovernanceCenterOpsPlugin = Object.assign(
  definePlugin<GovernanceCenterOpsConfig>({
    name: 'governance-center-entry-node-ops-managed',
    inject: [
      STORAGE_SERVICE,
      CLOCK_SERVICE,
      ENTRY_OPENING_SERVICE,
      ENTRY_MAINTENANCE_SERVICE,
      ASSEMBLY_LIFETIME_SERVICE,
    ],
    Config: GovernanceCenterOpsConfigSchema,
    apply(ctx: Context, config) {
      const work = createGovernanceCenterOps(
        config,
        dependencies(ctx, () => ctx.fiber.uid !== null && ctx.assemblyLifetime.isCurrent()),
      )
      startAssemblyWork(ctx, work.setup, work.close)
    },
  }),
  { assemblyLifecycle: 1 as const, describeAssembly: describeOpsAssembly },
)
