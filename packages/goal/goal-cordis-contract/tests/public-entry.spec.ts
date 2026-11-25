import { expect, it } from 'vitest'

it('exports nothing on the root: the root does not know Cordis', async () => {
  const root = (await import('@omne-harness/goal-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})

it('exports the three service definitions and their keys on the cordis entry', async () => {
  const cordis = await import('@omne-harness/goal-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'GoalCheckingService',
    'GoalReconcilingService',
    'GoalsService',
    'goalCheckingKey',
    'goalReconcilingKey',
    'goalsKey',
  ])
  expect(cordis.goalCheckingKey).toBe('goalChecking')
  expect(cordis.GoalCheckingService.provide).toBe(cordis.goalCheckingKey)
  expect(cordis.goalsKey).toBe('goals')
  expect(cordis.goalReconcilingKey).toBe('goalReconciling')
  expect(cordis.GoalsService.provide).toBe(cordis.goalsKey)
  expect(cordis.GoalReconcilingService.provide).toBe(cordis.goalReconcilingKey)
})
