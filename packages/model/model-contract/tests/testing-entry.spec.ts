import { expect, it } from 'vitest'

it('the testing entry exports the scripted provider and transport, the misuse error and the conformance suite', async () => {
  const testing = await import('@omne-harness/model-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'CONFORMANCE_OBLIGATIONS',
    'ScriptedModelError',
    'checkModelProviderConformance',
    'createScriptedConformanceSubject',
    'createScriptedModelProvider',
    'createScriptedTransport',
  ])
})
