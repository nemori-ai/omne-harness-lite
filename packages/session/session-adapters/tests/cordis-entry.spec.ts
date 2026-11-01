import { expect, it } from 'vitest'

it('cordis entry exports the production plugins that have landed', async () => {
  const cordis = (await import('@omne-harness/session-adapters/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual(['SessionIdentityBridgeProvider'])
})
