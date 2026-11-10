import { expect, it } from 'vitest'

it('the cordis entry exports the plugins and the credential service function, not the service definition', async () => {
  const cordis = await import('@omne-harness/model-host-local/cordis')
  expect(Object.keys(cordis).sort()).toEqual([
    'ModelConvertersLocalPlugin',
    'ModelInstancesLocalPlugin',
    'ModelProfilesLocalPlugin',
    'createConfiguredModelRuntimeLocalPlugin',
    'createMemoryResultPushLedger',
    'createModelRequestPreparationPlugin',
    'createModelRuntimeLocalPlugin',
    'createModelSendStagePlugin',
    'createModelStreamLocalPlugin',
    'serveModelCredential',
  ])
})
