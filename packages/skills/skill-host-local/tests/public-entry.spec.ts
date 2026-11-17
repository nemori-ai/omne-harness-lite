import { expect, it } from 'vitest'

it('the root entry exports the two sources and the decisions and nothing else at run time', async () => {
  const root: Record<string, unknown> = await import('@omne-harness/skill-host-local')
  expect(Object.keys(root).sort()).toEqual([
    'createContentStoreSource',
    'createDirectorySource',
    'createSkillDecisions',
    'publishedCandidate',
  ])
})
