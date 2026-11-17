import { expect, it } from 'vitest'

it('根入口只给出模型与两个视图', async () => {
  const root = (await import('@omne-harness/session-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'ConversationPage',
    'SessionListPanel',
    'SessionWorkspaces',
  ])
})
