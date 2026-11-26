import { expect, it } from 'vitest'

it('exports the two executors of agent work in a session, the identities they derive and the end they read', async () => {
  const root = (await import('@omne-harness/schedule-session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createExistingSessionExecutor',
    'createNewSessionExecutor',
    'endOf',
    'identitiesOf',
    'issuesText',
  ])
})
