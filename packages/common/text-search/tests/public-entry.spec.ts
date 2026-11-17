import { expect, it } from 'vitest'

it('exports the text search functions and nothing else', async () => {
  const root = (await import('@omne-harness/text-search')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'buildCorpus',
    'decodeCursor',
    'encodeCursor',
    'rank',
    'tokenize',
  ])
})
