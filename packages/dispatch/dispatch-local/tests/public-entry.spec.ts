import { expect, it } from 'vitest'

it('exports the SQL materials, the store, the application and the policy on the root', async () => {
  const root = (await import('@omne-harness/dispatch-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DispatchPolicyError',
    'createDispatchLocalApplication',
    'createSqlDispatchStore',
    'dispatchPersistenceParticipant',
    'dispatchPolicySchema',
    'dispatchSqlMaterials',
  ])
})

it('exports the provider plugin on the cordis entry, and nothing else', async () => {
  const cordis = (await import('@omne-harness/dispatch-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createDispatchLocalPlugin'])
})
