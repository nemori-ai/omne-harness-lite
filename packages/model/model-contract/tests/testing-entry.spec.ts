import { expect, it } from 'vitest'

it('the testing entry exports the scripted provider and transport, the misuse error and the scripted conformance subject', async () => {
  const testing = await import('@omne-harness/model-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'ScriptedModelError',
    'createScriptedConformanceSubject',
    'createScriptedModelProvider',
    'createScriptedTransport',
  ])
})
