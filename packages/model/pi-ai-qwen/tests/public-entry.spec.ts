import { expect, it } from 'vitest'

it('the root entry exports the family factory, the profiles, the records and their reasoning format', async () => {
  const root: object = await import('@omne-harness/pi-ai-qwen')
  expect(Object.keys(root).toSorted()).toEqual([
    'QWEN_OWNER',
    'QWEN_REASONING_FORMAT',
    'QWEN_RECORDS',
    'createQwenFamily',
    'officialQwenProfiles',
  ])
})
