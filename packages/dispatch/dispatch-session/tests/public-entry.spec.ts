import { expect, it } from 'vitest'

it('exports the sources, the texts of the three inputs, the adapter of the session port and the context copies', async () => {
  const root = (await import('@omne-harness/dispatch-session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DISPATCH_SOURCES',
    'SILENT_REPLY',
    'createContextCopies',
    'createDispatchSessions',
    'dispatchInputSources',
    'instructionText',
    'messageText',
    'reportText',
    'sessionOfDispatch',
  ])
})
