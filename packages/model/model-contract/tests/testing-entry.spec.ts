import { expect, it } from 'vitest'

it('the testing entry exports the scripted provider and transport, the misuse error, the scripted conformance subject and the three public doubles', async () => {
  const testing = await import('@omne-harness/model-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'ScriptedModelError',
    'createScriptedConformanceSubject',
    'createScriptedModelProvider',
    'createScriptedResultPusher',
    'createScriptedStreamObservation',
    'createScriptedStreamReferences',
    'createScriptedTransport',
  ])
})
