import { expect, it } from 'vitest'

it('exports the protocol contract alone', async () => {
  const root = (await import('@omne-harness/tool-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['toolProtocol'])
})
