import { STORAGE_SERVICE, type StorageService } from '@omne-harness-lite/storage/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { MembershipsService } from '@omne-harness-lite/organization-governance'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy-table'
import { createEvaluationInputReader } from './reader.ts'
import type { InputSourceDependencies, DeployedOfficialEntry } from './types.ts'

export const CURRENT_EVALUATION_INPUTS_SERVICE = 'currentEvaluationInputs' as const
export function createEvaluationInputStorePlugin(
  ports: Pick<InputSourceDependencies, 'diagnostics' | 'onDiagnosticFailure' | 'monotonicNow'>,
) {
  return definePlugin({
    name: 'evaluation-input-store',
    inject: [STORAGE_SERVICE, 'memberships', 'sessionTenancy'],
    Config: z
      .object({ storeKey: z.string().min(1), deployedOfficial: z.array(z.unknown()) })
      .strict(),
    apply(ctx, config) {
      const reader = createEvaluationInputReader({
        ...ports,
        storeKey: config.storeKey,
        deployedOfficial: config.deployedOfficial as DeployedOfficialEntry[],
        storage: ctx.get(STORAGE_SERVICE) as StorageService & AtomicStorage,
        memberships: ctx.get('memberships') as MembershipsService,
        sessionTenancy: ctx.get('sessionTenancy') as SessionTenancyService,
      })
      ctx.effect(() => () => reader.close())
      ctx.provide(CURRENT_EVALUATION_INPUTS_SERVICE, Object.freeze({ read: reader.read }))
    },
  })
}
