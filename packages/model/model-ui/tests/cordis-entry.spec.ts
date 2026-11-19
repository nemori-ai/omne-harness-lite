import { expect, it } from 'vitest'
import { modelChoicesKey, modelClientService, modelUiModule } from '@omne-harness/model-ui/cordis'
import { startShell } from './fixtures/shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const client = {
  'list-models': async () => ({ outcome: 'succeeded', body: { models: [] } }),
}

it('the cordis entry gives the module, the key of its service and the name of its client', async () => {
  const cordis = (await import('@omne-harness/model-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'modelChoicesKey',
    'modelClientService',
    'modelUiModule',
  ])
  expect(modelClientService).toBe('protocol:model/v1')
  expect(modelChoicesKey).toBe('model.choices')
})

it('while model/v1 is on the tree: provides the list of choices, and places nothing in the shell', async () => {
  const { root, shell } = await startShell()
  const withdraw = root.reflect.provide(modelClientService, client)
  await root.plugin(modelUiModule)
  const lookup = root as unknown as { get(name: string): { list(t: string): Promise<unknown> } }
  expect(await lookup.get(modelChoicesKey).list(TENANT)).toEqual({ kind: 'listed', choices: [] })
  for (const slot of ['gate', 'pages', 'sidebar', 'attached'] as const)
    expect(shell.items(slot)).toEqual([])
  // The protocol goes: the service goes with it.
  withdraw()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(lookup.get(modelChoicesKey)).toBeUndefined()
})

it('without model/v1 it provides nothing', async () => {
  const { root } = await startShell()
  await root.plugin(modelUiModule)
  const lookup = root as unknown as { get(name: string): unknown }
  expect(lookup.get(modelChoicesKey)).toBeUndefined()
})
