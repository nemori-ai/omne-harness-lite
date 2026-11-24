import { expect, it } from 'vitest'

const PUBLIC = [
  'ENTRY_SOURCES_POINT',
  'NAME_MAX',
  'RESERVED_SPACE',
  'TIERS',
  'accept',
  'codeMask',
  'complete',
  'fullName',
  'indexOf',
  'isFullName',
  'isName',
  'judge',
  'judgeListing',
  'lookupOf',
  'placeOf',
  'rankOf',
  'recognize',
  'sameView',
  'search',
  'shortAt',
  'typing',
  'unescape',
  'viewOf',
]

it('the public entry is the recognition, the sender view, the completion and the source shapes, and nothing that knows a source', async () => {
  const root = (await import('@omne-harness/slash-command-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(PUBLIC)
})
