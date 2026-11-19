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
    'documentRow',
    'documentsOf',
    'foldText',
    'isSearchableKind',
    'kindMarker',
    'matchEntry',
    'planAdmits',
    'searchableKindOf',
    'snippetOf',
    'visibilityMarker',
  ])
})
