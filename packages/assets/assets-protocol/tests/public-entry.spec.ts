import { expect, it } from 'vitest'

it('the public entry gives the protocol contract and nothing else at run time', async () => {
  const root = (await import('@omne-harness/assets-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['assetsProtocol'])
})
