import { expect, it } from 'vitest'
import { createModelUiModule, modelChoicesKey } from '@omne-harness/model-ui/cordis'
import { modelProtocol } from '@omne-harness/model-protocol'
import { providedOn, serveProtocol } from '@omne-harness/shell-contract/testing'
import { startShell } from './fixtures/shell.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const client = {
  'list-models': async () => ({ outcome: 'succeeded', body: { models: [] } }),
}

it('the cordis entry gives the module and the key of its service', async () => {
  const cordis = (await import('@omne-harness/model-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'CREDENTIAL_REMEDY_ID',
    'PROVIDER_BLOCK_ID',
    'PROVIDER_CATEGORY',
    'createModelUiModule',
    'modelChoicesKey',
  ])
  expect(modelChoicesKey).toBe('model.choices')
})

it('while model/v1 is on the tree: provides the list of choices; without points handed in it places nothing', async () => {
  const { root, shell } = await startShell()
  const served = await serveProtocol(root, modelProtocol, client)
  await root.plugin(createModelUiModule())
  expect(shell.adoption('model-ui')).toMatchObject({
    kind: 'adopted',
    bindings: { model: { key: 'model/v1' } },
  })
  expect(await providedOn(shell, modelChoicesKey)?.list(TENANT)).toEqual({
    kind: 'listed',
    choices: [],
  })
  for (const slot of ['gate', 'pages', 'sidebar', 'attached'] as const)
    expect(shell.items(slot)).toEqual([])
  // The protocol goes: the service goes with it.
  await served.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(providedOn(shell, modelChoicesKey)).toBeUndefined()
})

it('without model/v1 it provides nothing', async () => {
  const { root, shell } = await startShell()
  await root.plugin(createModelUiModule())
  expect(providedOn(shell, modelChoicesKey)).toBeUndefined()
})
