import { expect, it } from 'vitest'

it('the root entry exports createTiktokenExecutor as its only run-time value', async () => {
  const root: object = await import('@omne-harness/tokenizer-tiktoken')
  expect(Object.keys(root)).toEqual(['createTiktokenExecutor'])
})
