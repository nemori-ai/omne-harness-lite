import { expect, it } from 'vitest'

it('the testing entry exports the scripted provider and transport, the misuse error, the scripted conformance subject, the three public doubles and the profile and preparation doubles', async () => {
  const testing = await import('@omne-harness/model-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'ScriptedModelError',
    'createScriptedConformanceSubject',
    'createScriptedModelProfiles',
    'createScriptedModelProvider',
    'createScriptedModelRequestPreparation',
    'createScriptedResultPusher',
    'createScriptedStreamObservation',
    'createScriptedStreamReferences',
    'createScriptedTransport',
  ])
})
