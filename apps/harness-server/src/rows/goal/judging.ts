import type { GoalJudging } from '@omne-harness/goal'
import { DEFAULT_JUDGE_CONFIG } from '@omne-harness/goal-contract'
import {
  examinationSettingsOf,
  goalJudgeSettings,
  judgeSettingOf,
  type ExaminationSettings,
} from '@omne-harness/goal-local'
import type { TenantIndependentSettingsService } from '../governance/independent-settings-service.ts'

const UNAVAILABLE = { kind: 'unavailable' } as const
type Settings = () => TenantIndependentSettingsService | undefined

/** One read of the goal settings of a tenant. Undefined: they cannot be read now. */
async function basisOf(settings: Settings, tenant: string): Promise<unknown> {
  const service = settings()
  if (service === undefined) return undefined
  try {
    const { request } = service.bindingOf(tenant, goalJudgeSettings)
    return await service.read(tenant, request)
  } catch {
    return undefined
  }
}

/** What the tenant set of examinations, read at each use. Null: it cannot be read now. */
export const examinationSettingsFor = async (
  settings: Settings,
  tenant: string,
): Promise<ExaminationSettings | null> => examinationSettingsOf(await basisOf(settings, tenant))

/** How a judging is asked: the configuration this release was measured with, under the model the session chose for itself, or else the one the tenant's setting names, read at each judging. A tenant that locked its setting is not chosen over. A setting that cannot be read is no basis, never the default. */
export function releaseJudging(settings: Settings): GoalJudging {
  return {
    async config(tenant, _session, chosen) {
      const set = judgeSettingOf(await basisOf(settings, tenant))
      if (set === null) return UNAVAILABLE
      const model = set.locked || chosen === null ? set.model : chosen
      return { kind: 'read', value: { ...DEFAULT_JUDGE_CONFIG, model } }
    },
    async examination(tenant) {
      const set = await examinationSettingsFor(settings, tenant)
      if (set === null) return UNAVAILABLE
      return { kind: 'read', value: { maxExaminations: set.maxExaminations, job: set.job } }
    },
  }
}
