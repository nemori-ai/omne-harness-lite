import { expect, it } from 'vitest'

it('root entry exports the pure functions that have landed', async () => {
  const root = (await import('@omne-harness/session-adapters')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'SESSION_COLLABORATION_MODE_TRANSLATION',
    'SESSION_MODES_PUBLICATION',
    'SESSION_PERMISSION_MODE_TRANSLATION',
    'createSessionModesPublication',
    'createSessionRuntimeContextTrust',
    'decodeSessionSlotRef',
    'encodeSessionSlotRef',
    'historySessionOf',
    'projectSessionCollaborationMode',
    'projectSessionPermissionMode',
  ])
  expect(typeof root['createSessionRuntimeContextTrust']).toBe('function')
})
