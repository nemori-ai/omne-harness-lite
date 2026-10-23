import { expect, it } from 'vitest'

it('the root entry exports the family factory, the profiles, the resources and the records', async () => {
  const root: object = await import('@omne-harness/pi-ai-openai')
  expect(Object.keys(root).toSorted()).toEqual([
    'OPENAI_OWNER',
    'OPENAI_RECORDS',
    'createOpenAiFamily',
    'officialOpenAiProfiles',
    'openAiTokenizerResources',
  ])
})
