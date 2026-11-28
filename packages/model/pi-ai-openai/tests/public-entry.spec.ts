import { expect, it } from 'vitest'

it('the root entry exports the families, the profiles, the resources, the records and their reasoning format', async () => {
  const root: object = await import('@omne-harness/pi-ai-openai')
  expect(Object.keys(root).toSorted()).toEqual([
    'OPENAI_DECISIONS_OWNER',
    'OPENAI_DECISIONS_RECORDS',
    'OPENAI_DIRECT_DECISIONS_OWNER',
    'OPENAI_DIRECT_DECISIONS_RECORDS',
    'OPENAI_LIVE_OWNER',
    'OPENAI_LIVE_RECORDS',
    'OPENAI_OWNER',
    'OPENAI_REASONING_FORMAT',
    'OPENAI_RECORDS',
    'createOpenAiDecisionsFamily',
    'createOpenAiDirectDecisionsFamily',
    'createOpenAiFamily',
    'createOpenAiLiveFamily',
    'officialOpenAiDecisionsProfiles',
    'officialOpenAiLiveProfiles',
    'officialOpenAiProfiles',
    'openAiTokenizerResources',
  ])
})
