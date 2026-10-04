import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { definePlugin } from '@omne-harness-lite/kernel-basis'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { MembershipsService } from '@omne-harness-lite/organization-governance'
import { SESSION_TENANCY } from '@omne-harness-lite/session-tenancy/cordis'
import { CurrentEvaluationInputsService, EVALUATION_INPUT_SUPPORT } from '@omne-harness-lite/asset-evaluation/cordis'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
import { createEvaluationInputReader } from './reader.ts'
import { validate } from '@omne-harness-lite/content-blocks'
import type { CapabilityId } from '@omne-harness-lite/asset-model'

class Inputs extends CurrentEvaluationInputsService {
  constructor(ctx: Context, private readonly reader: CurrentEvaluationInputs) { super(ctx) }
  read(...args: Parameters<CurrentEvaluationInputs['read']>) { return this.reader.read(...args) }
}
export const evaluationInputStorePlugin = definePlugin({
  name: 'evaluation-input-store',
  inject: ['storage', 'memberships', SESSION_TENANCY, EVALUATION_INPUT_SUPPORT],
  Config: z.object({ storeKey: z.string().min(1), deployedOfficial: z.array(z.object({
    capability: z.custom<CapabilityId>(value => validate('CapabilityId', value).valid), meta: z.boolean(),
  }).strict()) }).strict(),
  apply(ctx, config) {
    const reader = createEvaluationInputReader({
      storeKey: config.storeKey, deployedOfficial: config.deployedOfficial,
      storage: ctx.get('storage') as AtomicStorage,
      memberships: ctx.get('memberships') as MembershipsService,
      sessionTenancy: ctx.sessionTenancy,
      monotonicNow: () => ctx.evaluationInputSupport.monotonicNow(),
      diagnostics: event => ctx.evaluationInputSupport.diagnostics(event),
      onDiagnosticFailure: stage => ctx.evaluationInputSupport.onDiagnosticFailure(stage),
    })
    ctx.effect(() => () => reader.close())
    new Inputs(ctx, reader)
  },
})
