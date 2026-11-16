import { expect, it } from 'vitest'

it('exports the client core and the two transports, and nothing else', async () => {
  const root = (await import('@omne-harness/sdk')) as Record<string, unknown>
  const core = (await import('@omne-harness/sdk/core')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'ClientRequestError',
    'createClient',
    'createHttpProtocolTransport',
    'createInProcessTransport',
  ])
  expect(Object.keys(core).sort()).toEqual(Object.keys(root).sort())
})
