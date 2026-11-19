import { expect, it } from 'vitest'

it('the root entry exports only the model/v1 contract', async () => {
  const root = (await import('@omne-harness/model-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['modelProtocol'])
})
