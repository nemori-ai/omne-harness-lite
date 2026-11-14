import { expect, it } from 'vitest'

it('the root entry exports the contribution and the journal file, the Cordis entry the plugin', async () => {
  const root = (await import('@omne-harness/session-access')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['createSessionContribution', 'openRequestJournal'])
  const cordis = (await import('@omne-harness/session-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createSessionAccessPlugin'])
})
