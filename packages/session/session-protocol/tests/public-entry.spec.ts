import { expect, it } from 'vitest'

it('the root entry exports the session/v1 contract and the user message derivation', async () => {
  const root = (await import('@omne-harness/session-protocol')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([
    'sessionProtocol',
    'userMessage',
    'userMessageId',
    'userTextMessage',
  ])
})
