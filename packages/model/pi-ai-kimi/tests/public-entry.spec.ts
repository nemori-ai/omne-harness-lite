import { expect, it } from 'vitest'

it('the root entry exports the family factory, the profiles, the records and their reasoning format', async () => {
  const root: object = await import('@omne-harness/pi-ai-kimi')
  expect(Object.keys(root).toSorted()).toEqual([
    'KIMI_OWNER',
    'KIMI_REASONING_FORMAT',
    'KIMI_RECORDS',
    'createKimiFamily',
    'officialKimiProfiles',
  ])
})
