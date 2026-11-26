import { expect, it } from 'vitest'

it('exports the executor of agent work in a new session, the identities it derives and the end it reads', async () => {
  const root = (await import('@omne-harness/schedule-session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'createNewSessionExecutor',
    'endOf',
    'identitiesOf',
    'issuesText',
  ])
})
