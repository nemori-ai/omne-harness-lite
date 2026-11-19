import { expect, it } from 'vitest'

it('the root entry exports the list of choices and its wording, and no Cordis binding', async () => {
  const root = (await import('@omne-harness/model-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createModelChoices', 'noteOf'])
})
