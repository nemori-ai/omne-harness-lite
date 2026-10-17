import { expect, it } from 'vitest'

it('the root entry exports exactly the landed runtime values', async () => {
  const root = (await import('@omne-harness/model-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    ['MODEL_SEND', 'decodeCredentialId', 'sameCredentialHolder'].sort(),
  )
})
