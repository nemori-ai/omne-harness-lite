import { expect, it } from 'vitest'

it('the root exports the SQL materials, the store, the application and the policy', async () => {
  const root = (await import('@omne-harness/goal-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'EXAMINERS',
    'GoalPolicyError',
    'createGoalLocalApplication',
    'createSqlGoalStore',
    'examinationSettingsOf',
    'goalJudgeItems',
    'goalJudgeSettings',
    'goalPersistenceParticipant',
    'goalPolicySchema',
    'goalSqlMaterials',
    'judgeModelOf',
    'judgeSettingOf',
  ])
})

it('the cordis entry exports the plugin factory', async () => {
  const cordis = (await import('@omne-harness/goal-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createGoalLocalPlugin'])
})
