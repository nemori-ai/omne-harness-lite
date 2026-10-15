import { expect, it } from 'vitest'
import { readBodyText, type JsonLimits } from '@omne-harness/assets'

const limits: JsonLimits = {
  maxBytes: 1_000,
  maxDepth: 10,
  maxItems: 100,
  maxMembers: 100,
  maxStringLength: 100,
  maxNumberLength: 100,
}

it('rejects a duplicate key before a category judges the body', () => {
  expect(readBodyText('{"name":"read_file","name":"other"}', limits)).toEqual({
    kind: 'duplicate-key',
    path: [],
    key: 'name',
  })
})

it('rejects a comment before a category judges the body', () => {
  expect(readBodyText('{"name":"read_file"} // note', limits)).toEqual({
    kind: 'syntax',
    reason: 'comment',
  })
})
