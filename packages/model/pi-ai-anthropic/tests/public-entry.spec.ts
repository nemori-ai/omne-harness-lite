import { expect, it } from 'vitest'

it('the root entry exports the family factory, the profiles, the resources and the records', async () => {
  const root: object = await import('@omne-harness/pi-ai-anthropic')
  expect(Object.keys(root).toSorted()).toEqual([
    'ANTHROPIC_OWNER',
    'ANTHROPIC_RECORDS',
    'TokenizerResourceError',
    'anthropicTokenizerResources',
    'createAnthropicFamily',
    'officialAnthropicProfiles',
  ])
})
