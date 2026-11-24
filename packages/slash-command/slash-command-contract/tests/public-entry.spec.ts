import { expect, it } from 'vitest'

it('the public entry is the recognition, the sender view and the completion, and nothing that knows a source', async () => {
  const root = (await import('@omne-harness/slash-command-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    [
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
    ].sort(),
  )
})
