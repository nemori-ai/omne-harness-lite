import { expect, it } from 'vitest'

it('exports nothing on the root: the root does not know Cordis', async () => {
  const root = (await import('@omne-harness/dispatch-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})

it('exports the two service definitions and their keys on the cordis entry', async () => {
  const cordis = await import('@omne-harness/dispatch-cordis-contract/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'DispatchReconcilingService',
    'DispatchingService',
    'dispatchReconcilingKey',
    'dispatchingKey',
  ])
  expect(cordis.dispatchingKey).toBe('dispatching')
  expect(cordis.dispatchReconcilingKey).toBe('dispatchReconciling')
  expect(cordis.DispatchingService.provide).toBe(cordis.dispatchingKey)
  expect(cordis.DispatchReconcilingService.provide).toBe(cordis.dispatchReconcilingKey)
})
