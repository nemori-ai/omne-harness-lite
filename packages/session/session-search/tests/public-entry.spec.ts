import { expect, it } from 'vitest'

it('exports the query compiler, the text rules, the plan reference and the hit', async () => {
  const root = (await import('@omne-harness/session-search')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'ANY',
    'BLOCK_SEPARATOR',
    'DEFAULT_SEARCH_KINDS',
    'EXTRACTION_VERSION',
    'SEARCHABLE_KINDS',
    'SNIPPET_CONTEXT',
    'SNIPPET_MATCH',
    'blocksOf',
    'compileQuery',
    'createHistoryFollower',
    'createHistorySearch',
    'createJudge',
    'createSearchMemo',
    'documentRow',
    'documentsOf',
    'foldText',
    'followSession',
    'followTenant',
    'isSearchableKind',
    'kindMarker',
    'matchEntry',
    'parseCursor',
    'planAdmits',
    'queryDigest',
    'searchHistory',
    'searchableKindOf',
    'snippetOf',
    'visibilityMarker',
  ])
})

it('exports the doubles of its two ports from the testing entry only', async () => {
  const testing = (await import('@omne-harness/session-search/testing')) as Record<string, unknown>
  expect(Object.keys(testing).sort()).toEqual([
    'ALPHABET',
    'createMemoryIndex',
    'createMemoryLog',
    'indexThrough',
    'random',
    'randomCommit',
    'randomQuery',
    'randomText',
    'testEntry',
    'tree',
  ])
})
