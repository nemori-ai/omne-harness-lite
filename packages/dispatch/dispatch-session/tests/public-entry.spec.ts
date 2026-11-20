import { expect, it } from 'vitest'

it('exports the sources, the texts of the three inputs and the adapter of the session port', async () => {
  const root = (await import('@omne-harness/dispatch-session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DISPATCH_SOURCES',
    'SILENT_REPLY',
    'createDispatchSessions',
    'dispatchInputSources',
    'instructionText',
    'messageText',
    'reportText',
  ])
})
