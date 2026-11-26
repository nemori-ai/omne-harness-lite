import type { GoalJudging } from '@omne-harness/goal'
import { DEFAULT_JUDGE_CONFIG } from '@omne-harness/goal-contract'
import { goalJudgeSettings, judgeModelOf } from '@omne-harness/goal-local'
import type { TenantIndependentSettingsService } from '../governance/independent-settings-service.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const

/** How a judging is asked: the configuration this release was measured with, under the model the tenant's
 * setting names at each judging. A setting that cannot be read is no basis, never the default. */
export function releaseJudging(
  settings: () => TenantIndependentSettingsService | undefined,
): GoalJudging {
  return {
    async config(tenant) {
      const service = settings()
      if (service === undefined) return UNAVAILABLE
      try {
        const { request } = service.bindingOf(tenant, goalJudgeSettings)
        const model = judgeModelOf(await service.read(tenant, request))
        if (model === null) return UNAVAILABLE
        return { kind: 'read', value: { ...DEFAULT_JUDGE_CONFIG, model } }
      } catch {
        return UNAVAILABLE
      }
    },
  }
}
