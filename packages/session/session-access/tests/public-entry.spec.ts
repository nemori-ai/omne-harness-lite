import { expect, it } from 'vitest'

it('the root entry exports the contribution and the Cordis entry exports the plugin', async () => {
  const root = (await import('@omne-harness/session-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createSessionContribution'])
  const cordis = (await import('@omne-harness/session-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual(['SESSION_ACCESS_PLUGIN', 'createSessionAccessPlugin'])
})
