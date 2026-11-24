import { expect, it } from 'vitest'

const PUBLIC = [
  'ENTRY_SOURCES_POINT',
  'NAME_MAX',
  'RESERVED_SPACE',
  'TIERS',
  'accept',
  'assistOf',
  'codeMask',
  'complete',
  'composing',
  'createComposer',
  'fullName',
  'indexOf',
  'isFullName',
  'isName',
  'judge',
  'judgeListing',
  'known',
  'listed',
  'literal',
  'lookupOf',
  'moved',
  'picked',
  'placeOf',
  'pressed',
  'rankOf',
  'recognize',
  'sameView',
  'search',
  'shortAt',
  'start',
  'typed',
  'typing',
  'unescape',
  'viewOf',
]

it('the public entry is the recognition, the sender view, the completion, the composer and the source shapes, and nothing that knows a source', async () => {
  const root = (await import('@omne-harness/slash-command-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(PUBLIC)
})
