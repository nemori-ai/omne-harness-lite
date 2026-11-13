import { expect, it } from 'vitest'

it('the root entry exports only the session/v1 contract', async () => {
  const root = (await import('@omne-harness/session-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['sessionProtocol'])
})
